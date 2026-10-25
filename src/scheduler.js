'use strict';

const cron = require('node-cron');
const { isRunning } = require('./pipeline/index');
const { recomputeLearning } = require('./learning');

let activeJobs = [];
let _settings = null;
let _db = null;
let _runPipelineFn = null;
let _runAlertWatchFn = null;
let _log = null;

const DAY_WATCH_CRON = '*/30 6-21 * * *';
const NIGHT_WATCH_CRON = '0 0-5,22-23 * * *';
const LEARNING_CRON = '30 3 * * 0';

function initScheduler(settings, db, runPipelineFn, log, runAlertWatchFn) {
  _settings = settings;
  _db = db;
  _runPipelineFn = runPipelineFn;
  _runAlertWatchFn = runAlertWatchFn;
  _log = log;

  schedulePipelineJobs();
  scheduleAlertWatchJobs();
  scheduleLogPruning();
  scheduleLearning();
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

function scheduleAlertWatchJobs() {
  if (!_runAlertWatchFn) return;
  const timezone = _settings.getTimezone();
  const schedules = [
    { expression: DAY_WATCH_CRON, time: 'every 30 minutes, 06:00–21:30', type: 'alert-watch-day' },
    { expression: NIGHT_WATCH_CRON, time: 'hourly, 22:00–05:00', type: 'alert-watch-night' },
  ];
  for (const entry of schedules) {
    const job = cron.schedule(entry.expression, () => {
      _runAlertWatchFn();
    }, { timezone });
    activeJobs.push({ time: entry.time, job, type: entry.type });
  }
  _log.info('scheduler', `Urgent watch: ${DAY_WATCH_CRON}; night emergencies: ${NIGHT_WATCH_CRON} (${timezone})`);
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

function scheduleLearning() {
  const timezone = _settings.getTimezone();
  const job = cron.schedule(LEARNING_CRON, () => {
    try {
      const result = recomputeLearning(_db);
      _log.info('learning', `Worked out ${result.nudges.length} learned nudges from ${result.seen_count} seen stories`);
    } catch (error) {
      _log.error('learning', `Could not work out learned nudges: ${error.message}`);
    }
  }, { timezone });
  activeJobs.push({ time: 'Sunday 03:30', job, type: 'learning' });
}

function refreshSchedule() {
  stopAll();
  schedulePipelineJobs();
  scheduleAlertWatchJobs();
  scheduleLogPruning();
  scheduleLearning();
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

module.exports = {
  initScheduler, refreshSchedule, getNextRuns, stopAll,
  DAY_WATCH_CRON, NIGHT_WATCH_CRON, LEARNING_CRON,
};
