'use strict';

const router = require('express').Router();
const { detectSource } = require('../sourceDetect');

const VALID_TYPES = ['rss', 'reddit', 'api'];

module.exports = function (db) {
  router.get('/sources', (req, res) => {
    try {
      res.json({ sources: db.getSources() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/sources/detect', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'url is required' });
      const detected = await detectSource(url);
      res.json(detected);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/sources', (req, res) => {
    try {
      const { name, type, url, config, default_category, priority } = req.body;
      if (!name || !type || !url) {
        return res.status(400).json({ error: 'name, type, and url are required' });
      }
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      }
      const id = db.addSource({ name, type, url, config, default_category, priority });
      res.status(201).json({ id, name, type, url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/sources/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      if (req.body.type && !VALID_TYPES.includes(req.body.type)) {
        return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      }
      db.updateSource(id, req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/sources/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      db.deleteSource(id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
