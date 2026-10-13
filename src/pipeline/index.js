'use strict';

const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('../logger');
const { collect } = require('./collector');
const { normalise } = require('./normalise');
const { filterItems } = require('./filter');
const { clusterItems } = require('./cluster');
const { makeJudge } = require('./sameStory');
const { rankClusters } = require('./rank');
const { extractClusters } = require('./extractor');
const { toItem } = require('./toItem');
const { categorise } = require('./categoriser');
const { summarise } = require('./summariser');
const { assemble } = require('./assembler');

let currentRun = null;
let cancelRequested = false;

function isRunning() {
  return currentRun !== null;
}

function getStatus() {
  return currentRun ? { ...currentRun } : null;
}

function requestCancel() {
  if (currentRun) cancelRequested = true;
}

function checkCancelled() {
  if (cancelRequested) throw new Error('Pipeline cancelled by user');
}

async function runPipeline(db, ollama, settings, log, emitSSE, trigger) {
  if (isRunning()) {
    throw new Error('Pipeline is already running');
  }

  const runId = uuidv4();
  const briefingDate = new Date().toLocaleDateString('en-CA', { timeZone: settings.getTimezone() });
  const emit = emitSSE || (() => {});
  const start = Date.now();

  // Create run in DB
  db.createRun(runId, trigger || 'manual');

  // Create run-scoped logger
  const runLog = createLogger(db, runId);
  if (emitSSE) {
    runLog.setSSEEmitter(emitSSE);
  }

  // Progress helper — emits progress events for the current stage
  function emitProgress(stage, current, total) {
    emit({ type: 'progress', stage, current, total });
  }

  currentRun = { runId, startedAt: new Date().toISOString(), stage: null, stageStartedAt: null };
  cancelRequested = false;
  emit({ type: 'start', runId });

  try {
    const enabledSources = db.getEnabledSources();
    const priorities = new Map(enabledSources.map(source => [source.name, source.priority]));
    const sourceMaxAge = new Map(enabledSources
      .filter(source => source.config && source.config.max_age_hours != null)
      .map(source => [source.name, Number(source.config.max_age_hours)]));

    // Stage 1 - Collect
    currentRun.stage = 'collect';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'collect', status: 'running' });
    const { items: collected, stats: collectStats } = await collect(db, runLog, emitProgress);
    const prioritised = collected.map(item => ({
      ...item,
      source_priority: priorities.get(item.source_name) ?? 1,
    }));
    db.updateRun(runId, { items_collected: collected.length });
    emit({ type: 'stage', stage: 'collect', status: 'complete', stats: collectStats });
    checkCancelled();

    // Stage 2 - Filter
    currentRun.stage = 'filter';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'filter', status: 'running' });
    const normalised = normalise(prioritised);
    const { kept, dropped: filteredOut, stats: filterStats } = filterItems(normalised, {
      maxAgeHours: settings.getFilterMaxAgeHours(),
      fillerPatterns: settings.getFillerPatterns(),
      sourceMaxAge,
      now: Date.now(),
    });
    for (const { item, reason } of filteredOut) {
      runLog.debug('pipeline:filter', `Dropped "${item.title}" (${reason})`);
    }
    runLog.info('pipeline:filter',
      `Filtered ${filterStats.total} items: ${filterStats.kept} kept, ${filterStats.stale} stale, ${filterStats.filler} filler`);
    emit({ type: 'stage', stage: 'filter', status: 'complete', stats: filterStats });
    checkCancelled();

    // Stage 3 - Cluster
    currentRun.stage = 'cluster';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'cluster', status: 'running' });
    const { clusters, stats: clusterStats } = await clusterItems(kept, {
      judge: makeJudge(ollama, settings, runLog),
      maxChecks: settings.getMaxSameStoryChecks(),
      log: runLog,
    });
    runLog.info('pipeline:cluster',
      `Clustered ${clusterStats.items} items into ${clusterStats.clusters} stories: ${clusterStats.url_merges} same link, ${clusterStats.path_merges} syndicated, ${clusterStats.similar_merges} similar, ${clusterStats.judged_yes}/${clusterStats.judged} confirmed by model`);
    emit({ type: 'stage', stage: 'cluster', status: 'complete', stats: clusterStats });
    checkCancelled();

    // Stage 4 - Rank
    currentRun.stage = 'rank';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'rank', status: 'running' });
    const preferences = settings.getPreferences();
    const { selected, stats: rankStats } = rankClusters(clusters, {
      now: Date.now(),
      boostKeywords: preferences.boost_keywords,
      penaltyKeywords: preferences.penalty_keywords,
      limit: settings.getMaxCuratedItems(),
    });
    runLog.info('pipeline:rank',
      `Ranked ${rankStats.clusters} stories: ${rankStats.selected} selected (${rankStats.floor_added} by source floor)`);
    db.updateRun(runId, { items_scored: selected.length });
    emit({ type: 'stage', stage: 'rank', status: 'complete', stats: rankStats });
    checkCancelled();

    // Stage 5 - Extract
    currentRun.stage = 'extract';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'extract', status: 'running' });
    const { clusters: extractedClusters, stats: extractStats } = await extractClusters(
      selected, settings, runLog, emitProgress
    );
    const extracted = extractedClusters.map(toItem);
    emit({ type: 'stage', stage: 'extract', status: 'complete', stats: extractStats });
    checkCancelled();

    // Stage 6 - Categorise
    currentRun.stage = 'categorise';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'categorise', status: 'running' });
    const { categorised, stats: catStats } = await categorise(extracted, db, ollama, settings, runLog, emitProgress, checkCancelled);
    emit({ type: 'stage', stage: 'categorise', status: 'complete', stats: catStats });
    checkCancelled();

    // Stage 7 - Summarise
    currentRun.stage = 'summarise';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'summarise', status: 'running' });
    const { items: summarised, stats: sumStats } = await summarise(categorised, ollama, settings, runLog, emitProgress, checkCancelled);
    db.updateRun(runId, { items_curated: summarised.length });
    emit({ type: 'stage', stage: 'summarise', status: 'complete', stats: sumStats });
    checkCancelled();

    // Stage 8 - Assemble
    currentRun.stage = 'assemble';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'assemble', status: 'running' });
    const categories = db.getCategories();
    const briefingData = assemble(summarised, categories, runLog);
    db.insertBriefing(briefingDate, { headline: briefingData.headline, sections: briefingData.sections });
    emit({ type: 'stage', stage: 'assemble', status: 'complete' });

    // Success
    const duration_ms = Date.now() - start;
    db.updateRun(runId, { finished_at: new Date().toISOString(), status: 'completed' });
    emit({ type: 'complete', briefingDate });

    currentRun = null;

    return {
      success: true,
      briefingDate,
      stats: {
        collected: collected.length,
        filtered: kept.length,
        clustered: clusters.length,
        ranked: selected.length,
        extracted: extracted.length,
        categorised: categorised.length,
        summarised: summarised.length,
        duration_ms,
      },
    };
  } catch (err) {
    const isCancelled = cancelRequested || err.message === 'Pipeline cancelled by user';
    const status = isCancelled ? 'cancelled' : 'error';

    if (isCancelled) {
      runLog.warn('pipeline', 'Pipeline cancelled by user');
    } else {
      runLog.error('pipeline', 'Pipeline failed', { error: err.message, stack: err.stack });
    }

    db.updateRun(runId, { finished_at: new Date().toISOString(), status, error_summary: err.message });
    emit({ type: status, error: err.message });

    currentRun = null;
    cancelRequested = false;

    return { success: false, error: err.message };
  }
}

module.exports = { runPipeline, isRunning, getStatus, requestCancel };
