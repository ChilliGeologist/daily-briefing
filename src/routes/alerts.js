'use strict';

const router = require('express').Router();
const { localDateAndHour } = require('../notifications');

module.exports = function (db, settings) {
  router.get('/alerts/checks', (req, res) => {
    try {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || ''))
        ? String(req.query.date)
        : localDateAndHour(new Date(), settings.getTimezone()).date;
      res.json({ date, checks: db.listAlertChecks(date) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/alerts/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid alert id' });
      const alert = db.getAlertById(id);
      if (!alert || !alert.sent) return res.status(404).json({ error: 'Alert not found' });
      res.json({ alert });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
