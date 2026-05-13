'use strict';

const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('../logger');
const { collect } = require('./collector');
const { scoreAndFilter } = require('./scorer');
const { extract } = require('./extractor');
const { dedup } = require('./dedup');
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
    // Stage 1 - Collect
    currentRun.stage = 'collect';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'collect', status: 'running' });
    const { items: collected, stats: collectStats } = await collect(db, runLog, emitProgress);
    db.updateRun(runId, { items_collected: collected.length });
    emit({ type: 'stage', stage: 'collect', status: 'complete', stats: collectStats });
    checkCancelled();

    // Stage 2 - Score
    currentRun.stage = 'score';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'score', status: 'running' });
    const { passed: scored, stats: scoreStats } = scoreAndFilter(collected, settings, runLog, emitProgress);
    db.updateRun(runId, { items_scored: scored.length });
    emit({ type: 'stage', stage: 'score', status: 'complete', stats: scoreStats });
    checkCancelled();

    // Stage 3 - Extract
    currentRun.stage = 'extract';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'extract', status: 'running' });
    const { items: extracted, stats: extractStats } = await extract(scored, settings, runLog, emitProgress);
    emit({ type: 'stage', stage: 'extract', status: 'complete', stats: extractStats });
    checkCancelled();

    // Stage 4 - Dedup
    currentRun.stage = 'dedup';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'dedup', status: 'running' });
    const { items: deduped, stats: dedupStats } = await dedup(extracted, ollama, settings, runLog, emitProgress);
    emit({ type: 'stage', stage: 'dedup', status: 'complete', stats: dedupStats });
    checkCancelled();

    // Stage 4 - Categorise
    currentRun.stage = 'categorise';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'categorise', status: 'running' });
    const { categorised, stats: catStats } = await categorise(deduped, db, ollama, settings, runLog, emitProgress, checkCancelled);
    emit({ type: 'stage', stage: 'categorise', status: 'complete', stats: catStats });
    checkCancelled();

    // Stage 5 - Summarise
    currentRun.stage = 'summarise';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'summarise', status: 'running' });
    const { items: summarised, stats: sumStats } = await summarise(categorised, ollama, settings, runLog, emitProgress, checkCancelled);
    db.updateRun(runId, { items_curated: summarised.length });
    emit({ type: 'stage', stage: 'summarise', status: 'complete', stats: sumStats });

    // Stage 6 - Assemble
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
        scored: scored.length,
        deduped: deduped.length,
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
