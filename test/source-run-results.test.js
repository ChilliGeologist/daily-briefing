'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initDB } = require('../src/db');

test('keeps each source result from the latest paper run, including its story count', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-gump-source-results-'));
  const db = initDB(path.join(dir, 'briefings.db'));
  t.after(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const sourceId = Number(db.addSource({ name: 'Test feed', type: 'rss', url: 'https://example.test/feed' }));
  db.createRun('morning-run', 'scheduled');
  db.addSourceRunResult({
    run_id: 'morning-run', source_id: sourceId, status: 'ok', item_count: 7,
    error: null, fetched_at: '2026-10-25T06:00:01.000Z',
  });
  assert.deepStrictEqual(db.getLatestSourceRunResults(), {
    [sourceId]: {
      run_id: 'morning-run',
      source_id: sourceId,
      status: 'ok',
      item_count: 7,
      error: null,
      fetched_at: '2026-10-25T06:00:01.000Z',
      run_started_at: db.getRun('morning-run').started_at,
    },
  });
});
