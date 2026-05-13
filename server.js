'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const { initDB } = require('./src/db');
const { createLogger } = require('./src/logger');
const { createSettings } = require('./src/settings');
const scheduler = require('./src/scheduler');
const pipeline = require('./src/pipeline');
const ollama = require('./src/ollama');
const updater = require('./src/updater');

const PORT = process.env.PORT || 3100;
const DB_PATH = path.join(__dirname, 'data', 'briefings.db');

function getVersion() {
  return updater.getCurrentVersion().display;
}

// Init database
const db = initDB(DB_PATH);

// Clean up orphaned runs (still "running" from before a restart)
db.cleanupOrphanedRuns();

// Init logger (with DB for persistence)
const log = createLogger(db);

// Init settings
const settings = createSettings(db);

// SSE Manager
const sseClients = new Map();
let sseNextId = 1;
const sseManager = {
  addClient(res) { const id = sseNextId++; sseClients.set(id, res); return id; },
  removeClient(id) { sseClients.delete(id); },
  broadcast(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const [id, res] of sseClients) {
      try { res.write(msg); } catch { sseClients.delete(id); }
    }
  }
};

// Init scheduler with SSE broadcast
scheduler.initScheduler(settings, db, (trigger) => {
  const emitSSE = (data) => sseManager.broadcast(data);
  pipeline.runPipeline(db, ollama, settings, log, emitSSE, trigger);
}, log);

// Init auto-update check
updater.startAutoCheck(settings.getUpdateCheckInterval(), (status) => {
  if (status.available) log.info('updater', `Update available: ${status.changelog.length} new commits`);
});

// Create Express app
const app = express();

// JSON body parsing with 5mb limit
app.use(express.json({ limit: '5mb' }));

// Raw body parsing for backup import
app.use('/api/backup/import', express.raw({ type: 'application/gzip', limit: '50mb' }));

// Serve manifest.json with correct MIME type
app.get('/manifest.json', (req, res) => {
  const manifestPath = path.join(__dirname, 'public', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.sendFile(manifestPath);
  } else {
    res.status(404).json({ error: 'manifest.json not found' });
  }
});

// Serve static files from public/ with no caching for dev agility
// index.html is excluded — served separately with cache-busted asset URLs
app.use(express.static(path.join(__dirname, 'public'), { index: false, etag: false, lastModified: false, setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: getVersion() });
});

// Mount API routes
app.use('/api', require('./src/routes/briefings')(db));
app.use('/api', require('./src/routes/sources')(db));
app.use('/api', require('./src/routes/categories')(db));
app.use('/api', require('./src/routes/settings')(db, settings, scheduler));
app.use('/api', require('./src/routes/pipeline')(db, pipeline, ollama, settings, log, sseManager));
app.use('/api', require('./src/routes/logs')(db));
app.use('/api', require('./src/routes/ollama')(ollama, settings));
app.use('/api', require('./src/routes/push')(db));
app.use('/api', require('./src/routes/updates')(updater));
app.use('/api', require('./src/routes/backup')(db, DB_PATH));

// SPA fallback: serve index.html with cache-busted asset URLs so the
// client-side router can handle /settings, /archive, /pipeline, etc.
// Must be registered AFTER all /api routes and express.static middleware.
const indexTemplate = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const cacheBust = updater.getCurrentVersion().version + '-' + Date.now();
const indexHtml = indexTemplate
  .replace('/style.css', '/style.css?v=' + cacheBust)
  .replace('/app.js', '/app.js?v=' + cacheBust);
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html');
  res.send(indexHtml);
});

// Start server
const server = app.listen(PORT, () => {
  log.info('server', `daily-briefing v${getVersion()} listening on port ${PORT}`);
});

// Graceful shutdown
function shutdown() {
  log.info('server', 'Shutting down...');
  scheduler.stopAll();
  updater.stopAutoCheck();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, db };
