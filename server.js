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
  return (process.env.DAILY_BRIEFING_VERSION || 'dev').substring(0, 7);
}

// Init database
const db = initDB(DB_PATH);

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

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

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
