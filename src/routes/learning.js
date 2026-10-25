'use strict';

const router = require('express').Router();
const {
  learningStatus,
  recordStoryEvents,
  recomputeLearning,
} = require('../learning');

module.exports = function (db, options = {}) {
  router.post('/events', (req, res) => {
    try {
      res.json(recordStoryEvents(db, req.body && req.body.events, { now: options.now }));
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get('/learning', (req, res) => {
    try {
      res.json(learningStatus(db));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/learning/recompute', (req, res) => {
    try {
      const result = (options.recompute || recomputeLearning)(db);
      res.json({ ...result, ...learningStatus(db) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/learning', (req, res) => {
    try {
      db.forgetLearning();
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
