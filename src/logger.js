'use strict';

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const ANSI = {
  grey: '\x1b[90m',
  white: '\x1b[37m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

const LEVEL_COLOURS = {
  DEBUG: ANSI.grey,
  INFO: ANSI.white,
  WARN: ANSI.yellow,
  ERROR: ANSI.red,
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatTimestamp(date) {
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function createLogger(db, runId) {
  let sseEmitter = null;

  function log(level, component, message, metadata) {
    const now = new Date();
    const ts = formatTimestamp(now);
    const isoTs = now.toISOString();

    // Console output
    const colour = LEVEL_COLOURS[level] || ANSI.white;
    const metaStr = metadata && Object.keys(metadata).length > 0
      ? ' ' + JSON.stringify(metadata)
      : '';
    const line = `${colour}[${ts}] [${level}] [${component}] ${message}${metaStr}${ANSI.reset}`;
    if (level === 'ERROR') {
      console.error(line);
    } else if (level === 'WARN') {
      console.warn(line);
    } else {
      console.log(line);
    }

    // Database insert (only if db is available)
    if (db) {
      try {
        db.insertLogEntry({
          run_id: runId || null,
          timestamp: isoTs,
          level,
          component,
          message,
          metadata: metadata ? JSON.stringify(metadata) : null,
        });
      } catch (err) {
        // Don't let logging failures crash the app
        console.error(`[LOGGER] Failed to write log to DB: ${err.message}`);
      }
    }

    // SSE emitter callback
    if (sseEmitter) {
      try {
        sseEmitter({
          run_id: runId || null,
          timestamp: isoTs,
          level,
          component,
          message,
          metadata: metadata || null,
        });
      } catch (_) {
        // Ignore SSE errors
      }
    }
  }

  return {
    debug(component, message, metadata) { log('DEBUG', component, message, metadata); },
    info(component, message, metadata) { log('INFO', component, message, metadata); },
    warn(component, message, metadata) { log('WARN', component, message, metadata); },
    error(component, message, metadata) { log('ERROR', component, message, metadata); },
    setSSEEmitter(emitFn) { sseEmitter = emitFn; },
  };
}

module.exports = { createLogger, LEVELS };
