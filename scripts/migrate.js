#!/usr/bin/env node
// Usage: node scripts/migrate.js /path/to/old/briefings.db
//
// Migrates briefings from the old daily-briefing system into the new schema.
// Run this inside the new container after first startup.

'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const oldDbPath = process.argv[2];
if (!oldDbPath) {
  console.error('Usage: node scripts/migrate.js /path/to/old/briefings.db');
  process.exit(1);
}

const newDbPath = path.join(__dirname, '..', 'data', 'briefings.db');

// Open old DB read-only
const oldDb = new Database(oldDbPath, { readonly: true });

// Open new DB
const newDb = new Database(newDbPath);

// Read all briefings from old system
const oldBriefings = oldDb.prepare('SELECT date, headline, data, item_count FROM briefings ORDER BY date ASC').all();

if (oldBriefings.length === 0) {
  console.log('No briefings found in old database.');
  process.exit(0);
}

// Prepare upsert statement for new DB
const upsert = newDb.prepare(
  `INSERT OR REPLACE INTO briefings (date, headline, data, item_count)
   VALUES (?, ?, ?, ?)`
);

const migrate = newDb.transaction((briefings) => {
  let count = 0;
  for (const b of briefings) {
    // Validate that data is parseable JSON
    try {
      JSON.parse(b.data);
    } catch {
      console.warn(`  Skipping ${b.date}: invalid JSON data`);
      continue;
    }

    upsert.run(b.date, b.headline, b.data, b.item_count || 0);
    count++;
  }
  return count;
});

const migrated = migrate(oldBriefings);
console.log(`${migrated} briefings migrated from ${oldDbPath}`);

oldDb.close();
newDb.close();
