'use strict';

const { v4: uuidv4 } = require('uuid');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createLogger } = require('../logger');
const { collect } = require('./collector');
const { normalise } = require('./normalise');
const { filterItems } = require('./filter');
const { clusterItems } = require('./cluster');
const { makeJudge } = require('./sameStory');
const { rankClusters } = require('./rank');
const { extractClusters } = require('./extractor');
const { toItem } = require('./toItem');
const { assemble } = require('./assembler');
const { createWriter } = require('./writer');
const { writeStories } = require('./writer/write');
const { editStories } = require('./writer/edit');
const { addToldToStories } = require('./writer/told');

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

async function saveCandidates(candidates, { candidatesDir, briefingDate, runId }) {
  await fs.mkdir(candidatesDir, { recursive: true });
  const filename = `${briefingDate}-${runId.slice(0, 8)}.json`;
  const savedPath = path.join(candidatesDir, filename);
  await fs.writeFile(savedPath, JSON.stringify(candidates, null, 2));

  const entries = await fs.readdir(candidatesDir, { withFileTypes: true });
  const candidateFiles = await Promise.all(entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(async entry => {
      const filePath = path.join(candidatesDir, entry.name);
      const stat = await fs.stat(filePath);
      return { filePath, name: entry.name, mtimeMs: stat.mtimeMs };
    }));
  candidateFiles.sort((a, b) => (b.mtimeMs - a.mtimeMs) || b.name.localeCompare(a.name));
  await Promise.all(candidateFiles.slice(7).map(file => fs.unlink(file.filePath)));
  return savedPath;
}

async function runPipeline(db, ollama, settings, log, emitSSE, trigger, options = {}) {
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
      interests: settings.getInterests(),
      limit: settings.getMaxCandidates(),
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
    await saveCandidates(extracted, {
      candidatesDir: options.candidatesDir || path.join(__dirname, '../../data/candidates'),
      briefingDate,
      runId,
    });
    emit({ type: 'stage', stage: 'extract', status: 'complete', stats: extractStats });
    checkCancelled();

    const writer = options.writer || createWriter(settings, runLog, options.writerDeps);

    // Stage 6 - Write
    currentRun.stage = 'write';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'write', status: 'running' });
    const { stories, dropped, stats: writeStats } = await writeStories(
      extracted, writer, settings, runLog, emitProgress, checkCancelled
    );
    await addToldToStories(stories, writer, runLog);
    db.updateRun(runId, { items_curated: stories.length });
    emit({ type: 'stage', stage: 'write', status: 'complete', stats: writeStats });
    checkCancelled();

    // Stage 7 - Edit
    currentRun.stage = 'edit';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'edit', status: 'running' });
    const edited = await editStories(stories, writer, settings, runLog);
    emit({ type: 'stage', stage: 'edit', status: 'complete', stats: edited.stats });
    checkCancelled();

    // Stage 8 - Assemble
    currentRun.stage = 'assemble';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'assemble', status: 'running' });
    const storiesById = new Map(stories.map(story => [story.id, story]));
    const usedWriters = [...new Set(stories.map(story => story.written_by).filter(Boolean))];
    const briefingData = assemble(edited, storiesById, {
      writer: usedWriters.join(' + ') || writer.name,
      stats: { write: writeStats, edit: edited.stats },
      log: runLog,
    });
    db.insertBriefing(briefingDate, briefingData);
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
        written: stories.length,
        not_news: dropped.length,
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

module.exports = { runPipeline, isRunning, getStatus, requestCancel, saveCandidates };
