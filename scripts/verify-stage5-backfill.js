#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initDB } = require('../src/db');

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/verify-stage5-backfill.js /path/to/briefings.db');
  process.exitCode = 1;
  return;
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-gump-stage5-prod-copy-'));
const copy = path.join(tempDir, 'briefings.db');
fs.copyFileSync(source, copy);

let db;
try {
  db = initDB(copy);
  const columns = db.raw.prepare('PRAGMA table_info(story_search)').all().map(column => column.name);
  const totals = db.raw.prepare(`
    SELECT COUNT(DISTINCT briefing_id) AS editions, COUNT(*) AS stories
    FROM story_search
  `).get();
  console.log(JSON.stringify({
    copy,
    columns,
    backfill: db.storySearchBackfill,
    indexed: totals,
  }, null, 2));

  ['plex', 'west tamar', 'launceston fire', 'Melania', '"AND -'].forEach(query => {
    const result = db.searchStories(query);
    const firstEdition = result.editions[0];
    const firstStory = firstEdition && firstEdition.stories[0];
    console.log(JSON.stringify({
      query,
      total: result.total,
      sample: firstStory ? {
        edition_id: firstEdition.id,
        date: firstEdition.date,
        key: firstStory.key,
        title: firstStory.title,
        snippet: firstStory.snippet,
      } : null,
    }, null, 2));
  });
} finally {
  if (db) db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
