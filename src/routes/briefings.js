'use strict';

const router = require('express').Router();
const { sanitiseSearchQuery } = require('../story-search');

module.exports = function (db) {
  router.get('/briefing', (req, res) => {
    try {
      const briefing = db.getLatestBriefing();
      if (!briefing) return res.status(404).json({ error: 'No briefings found' });
      res.json({ id: briefing.id, date: briefing.date, headline: briefing.headline, data: briefing.data, is_latest: true });
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
      const latest = db.getLatestBriefing();
      res.json({
        id: briefing.id,
        date: briefing.date,
        headline: briefing.headline,
        data: briefing.data,
        is_latest: Boolean(latest && latest.id === briefing.id),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/briefings', (req, res) => {
    try {
      const briefings = db.listBriefings();
      res.json({ briefings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/search', (req, res) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!query) return res.status(400).json({ error: 'Search query is required' });
      const before = typeof req.query.before === 'string' ? req.query.before : undefined;
      const result = db.searchStories(query, req.query.limit, before);
      if (!sanitiseSearchQuery(query)) {
        return res.status(400).json({ error: 'Search query is too short' });
      }
      res.json(result);
    } catch (err) {
      res.status(err.code === 'INVALID_SEARCH_CURSOR' ? 400 : 500).json({ error: err.message });
    }
  });

  return router;
};
