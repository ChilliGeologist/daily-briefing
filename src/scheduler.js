'use strict';

const cron = require('node-cron');
const { isRunning } = require('./pipeline/index');

let activeJobs = [];
let _settings = null;
let _db = null;
let _runPipelineFn = null;
let _log = null;

function initScheduler(settings, db, runPipelineFn, log) {
  _settings = settings;
  _db = db;
  _runPipelineFn = runPipelineFn;
  _log = log;

  schedulePipelineJobs();
  scheduleLogPruning();
}

function schedulePipelineJobs() {
  const schedule = _settings.getSchedule();
  const timezone = _settings.getTimezone();

  for (const time of schedule) {
    const [hour, minute] = time.split(':');
    const expression = `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;

    const job = cron.schedule(expression, () => {
      if (isRunning()) {
        _log.info('scheduler', `Skipping scheduled run (${time}) — pipeline already running`);
        return;
      }
      _log.info('scheduler', `Scheduled pipeline run triggered (${time})`);
      _runPipelineFn('scheduled');
    }, { timezone });

    activeJobs.push({ time, job, type: 'pipeline' });
  }

  _log.info('scheduler', `Scheduled pipeline runs: ${schedule.join(', ')} (${timezone})`);
}

function scheduleLogPruning() {
  const timezone = _settings.getTimezone();

  const job = cron.schedule('0 3 * * *', () => {
    const days = _settings.getLogRetentionDays();
    _log.info('scheduler', `Pruning log entries older than ${days} days`);
    _db.pruneLogEntries(days);
  }, { timezone });

  activeJobs.push({ time: '03:00', job, type: 'prune' });
}

function refreshSchedule() {
  stopAll();
  schedulePipelineJobs();
  scheduleLogPruning();
}

function getNextRuns() {
  const schedule = _settings.getSchedule();
  const timezone = _settings.getTimezone();
  const now = new Date();

  // Get current time in the target timezone
  const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

  const nextRuns = [];

  for (const time of schedule) {
    const [hour, minute] = time.split(':').map(Number);

    // Start with today at the scheduled time
    const candidate = new Date(nowInTz);
    candidate.setHours(hour, minute, 0, 0);

    // If this time has already passed today, move to tomorrow
    if (candidate <= nowInTz) {
      candidate.setDate(candidate.getDate() + 1);
    }

    // Calculate the offset between nowInTz and now to convert back
    const offsetMs = now.getTime() - nowInTz.getTime();
    const actualTime = new Date(candidate.getTime() + offsetMs);

    nextRuns.push(actualTime.toISOString());
  }

  return nextRuns.sort();
}

function stopAll() {
  for (const entry of activeJobs) {
    entry.job.stop();
  }
  activeJobs = [];
}

module.exports = { initScheduler, refreshSchedule, getNextRuns, stopAll };
