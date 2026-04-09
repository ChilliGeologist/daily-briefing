'use strict';

const router = require('express').Router();

module.exports = function (db) {
  router.get('/briefing', (req, res) => {
    try {
      const briefing = db.getLatestBriefing();
      if (!briefing) return res.status(404).json({ error: 'No briefings found' });
      res.json({ date: briefing.date, headline: briefing.headline, data: briefing.data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/briefing/:date', (req, res) => {
    try {
      const { date } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }
      const briefing = db.getBriefing(date);
      if (!briefing) return res.status(404).json({ error: 'Briefing not found' });
      res.json({ date: briefing.date, headline: briefing.headline, data: briefing.data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/briefings', (req, res) => {
    try {
      let limit = parseInt(req.query.limit, 10) || 90;
      if (limit < 1) limit = 1;
      if (limit > 365) limit = 365;
      const briefings = db.listBriefings(limit);
      res.json({ briefings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
