'use strict';

const router = require('express').Router();

module.exports = function (updater) {
  router.get('/updates/check', async (req, res) => {
    try {
      const status = await updater.checkForUpdates();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/updates/status', (req, res) => {
    try {
      const current = updater.getCurrentVersion();
      const lastCheck = updater.getLastCheckResult();
      res.json({ current: current.display, version: current.version, isDev: current.isDev, lastCheck });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
