'use strict';

const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SQLITE_HEADER = 'SQLite format 3\0';

module.exports = function (db, dbPath) {
  router.get('/backup/export', (req, res) => {
    try {
      // Checkpoint WAL first to ensure consistent backup
      try { db.raw.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) { /* ignore */ }

      const date = new Date().toISOString().split('T')[0];
      const filename = `daily-briefing-backup-${date}.gz`;

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const readStream = fs.createReadStream(dbPath);
      const gzip = zlib.createGzip();

      readStream.pipe(gzip).pipe(res);

      readStream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: err.message });
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/backup/import', (req, res) => {
    try {
      const chunks = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const compressed = Buffer.concat(chunks);

        zlib.gunzip(compressed, (err, decompressed) => {
          if (err) {
            return res.status(400).json({ error: 'Failed to decompress: ' + err.message });
          }

          // Validate SQLite header
          if (decompressed.length < 16 || decompressed.toString('utf8', 0, 16) !== SQLITE_HEADER) {
            return res.status(400).json({ error: 'Invalid SQLite database file' });
          }

          // Close current DB, write new one, restart
          try {
            db.close();
            fs.writeFileSync(dbPath, decompressed);
            res.json({ ok: true, message: 'Database restored, restarting...' });
            setTimeout(() => process.exit(0), 500);
          } catch (writeErr) {
            res.status(500).json({ error: 'Failed to restore: ' + writeErr.message });
          }
        });
      });

      req.on('error', (err) => {
        res.status(500).json({ error: err.message });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
