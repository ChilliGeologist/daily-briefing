'use strict';

const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('../logger');
const { collect } = require('./collector');
const { scoreAndFilter } = require('./scorer');
const { dedup } = require('./dedup');
const { categorise } = require('./categoriser');
const { summarise } = require('./summariser');
const { assemble } = require('./assembler');

let currentRun = null;

function isRunning() {
  return currentRun !== null;
}

function getStatus() {
  return currentRun ? { ...currentRun } : null;
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

  currentRun = { runId, startedAt: new Date().toISOString(), stage: null, stageStartedAt: null };

  try {
    // Stage 1 - Collect
    currentRun.stage = 'collect';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'collect', status: 'running' });
    const { items: collected, stats: collectStats } = await collect(db, runLog);
    db.updateRun(runId, { items_collected: collected.length });
    emit({ type: 'stage', stage: 'collect', status: 'complete', stats: collectStats });

    // Stage 2 - Score
    currentRun.stage = 'score';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'score', status: 'running' });
    const { passed: scored, stats: scoreStats } = scoreAndFilter(collected, settings, runLog);
    db.updateRun(runId, { items_scored: scored.length });
    emit({ type: 'stage', stage: 'score', status: 'complete', stats: scoreStats });

    // Stage 3 - Dedup
    currentRun.stage = 'dedup';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'dedup', status: 'running' });
    const { items: deduped, stats: dedupStats } = await dedup(scored, ollama, settings, runLog);
    emit({ type: 'stage', stage: 'dedup', status: 'complete', stats: dedupStats });

    // Stage 4 - Categorise
    currentRun.stage = 'categorise';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'categorise', status: 'running' });
    const { categorised, stats: catStats } = await categorise(deduped, db, ollama, settings, runLog);
    emit({ type: 'stage', stage: 'categorise', status: 'complete', stats: catStats });

    // Stage 5 - Summarise
    currentRun.stage = 'summarise';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'summarise', status: 'running' });
    const { items: summarised, stats: sumStats } = await summarise(categorised, ollama, settings, runLog);
    db.updateRun(runId, { items_curated: summarised.length });
    emit({ type: 'stage', stage: 'summarise', status: 'complete', stats: sumStats });

    // Stage 6 - Assemble
    currentRun.stage = 'assemble';
    currentRun.stageStartedAt = new Date().toISOString();
    emit({ type: 'stage', stage: 'assemble', status: 'running' });
    const categories = db.getCategories();
    const briefingData = assemble(summarised, categories, runLog);
    db.upsertBriefing(briefingDate, { headline: briefingData.headline, sections: briefingData.sections });
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
    runLog.error('pipeline', 'Pipeline failed', { error: err.message, stack: err.stack });
    db.updateRun(runId, { finished_at: new Date().toISOString(), status: 'error', error_summary: err.message });
    emit({ type: 'error', error: err.message });

    currentRun = null;

    return { success: false, error: err.message };
  }
}

module.exports = { runPipeline, isRunning, getStatus };
