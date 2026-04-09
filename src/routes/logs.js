'use strict';

const router = require('express').Router();

const LEVEL_MAP = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

module.exports = function (db) {
  router.get('/logs', (req, res) => {
    try {
      const filters = {};
      if (req.query.component) filters.component = req.query.component;
      if (req.query.since) filters.since = req.query.since;
      filters.limit = parseInt(req.query.limit, 10) || 200;

      let entries = db.getLogEntries(filters);

      // Level filter: return entries at or above the specified level
      if (req.query.level) {
        const minLevel = LEVEL_MAP[req.query.level.toUpperCase()];
        if (minLevel !== undefined) {
          entries = entries.filter(e => (LEVEL_MAP[e.level] || 0) >= minLevel);
        }
      }

      res.json({ entries });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/logs/:runId', (req, res) => {
    try {
      const filters = {};
      if (req.query.component) filters.component = req.query.component;

      let entries = db.getRunLog(req.params.runId, filters);

      if (req.query.level) {
        const minLevel = LEVEL_MAP[req.query.level.toUpperCase()];
        if (minLevel !== undefined) {
          entries = entries.filter(e => (LEVEL_MAP[e.level] || 0) >= minLevel);
        }
      }

      res.json({ entries });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
