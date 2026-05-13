'use strict';

const router = require('express').Router();

module.exports = function (db) {
  router.get('/briefing', (req, res) => {
    try {
      const briefing = db.getLatestBriefing();
      if (!briefing) return res.status(404).json({ error: 'No briefings found' });
      res.json({ id: briefing.id, date: briefing.date, headline: briefing.headline, data: briefing.data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/briefing/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid briefing id' });
      const briefing = db.getBriefingById(id);
      if (!briefing) return res.status(404).json({ error: 'Briefing not found' });
      res.json({ id: briefing.id, date: briefing.date, headline: briefing.headline, data: briefing.data });
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
