'use strict';

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');

module.exports = function (db, pipeline, ollama, settings, log, sseManager) {
  router.post('/pipeline/run', (req, res) => {
    try {
      if (pipeline.isRunning()) {
        return res.status(409).json({ error: 'Pipeline is already running' });
      }
      const runId = uuidv4();
      const emitSSE = (data) => sseManager.broadcast(data);

      setImmediate(() => {
        pipeline.runPipeline(db, ollama, settings, log, emitSSE, 'manual');
      });

      res.json({ ok: true, runId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/pipeline/cancel', (req, res) => {
    try {
      if (!pipeline.isRunning()) {
        return res.status(409).json({ error: 'No pipeline run in progress' });
      }
      pipeline.requestCancel();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/pipeline/status', (req, res) => {
    try {
      const runs = db.listRuns(1);
      res.json({
        running: pipeline.isRunning(),
        currentRun: pipeline.getStatus(),
        lastRun: runs[0] || null,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/pipeline/runs', (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      res.json({ runs: db.listRuns(limit) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/pipeline/runs/:id', (req, res) => {
    try {
      const run = db.getRun(req.params.id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      res.json(run);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/pipeline/runs/:id/log', (req, res) => {
    try {
      const run = db.getRun(req.params.id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      const entries = db.getRunLog(req.params.id);
      res.json({ run, entries });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/pipeline/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = sseManager.addClient(res);
    req.on('close', () => sseManager.removeClient(clientId));
  });

  return router;
};
