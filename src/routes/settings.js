'use strict';

const router = require('express').Router();

module.exports = function (db, settings, scheduler) {
  router.get('/settings', (req, res) => {
    try {
      res.json(settings.getAll());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/settings/:key', (req, res) => {
    try {
      const value = db.getSetting(req.params.key);
      if (value === null) return res.status(404).json({ error: 'Setting not found' });
      res.json({ key: req.params.key, value });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/settings', (req, res) => {
    try {
      const updates = req.body;
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'Body must be a JSON object of key-value pairs' });
      }
      let scheduleChanged = false;
      for (const [key, value] of Object.entries(updates)) {
        settings.set(key, value);
        if (key === 'schedule' || key === 'timezone') scheduleChanged = true;
      }
      if (scheduleChanged) {
        scheduler.refreshSchedule(settings);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/settings/:key', (req, res) => {
    try {
      const { value } = req.body;
      if (value === undefined) {
        return res.status(400).json({ error: 'value is required' });
      }
      settings.set(req.params.key, value);
      if (req.params.key === 'schedule' || req.params.key === 'timezone') {
        scheduler.refreshSchedule(settings);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
