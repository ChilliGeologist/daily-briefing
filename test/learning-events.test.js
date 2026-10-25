'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { initDB } = require('../src/db');
let learningRoutes;
try { learningRoutes = require('../src/routes/learning'); }
catch (_) { learningRoutes = () => { throw new Error('learning routes are not implemented'); }; }
const edition = require('./fixtures/stage5-new-edition.json');

test('event route validates edition stories, copies their features, and dedupes whole events', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-gump-stage7-events-'));
  const db = initDB(path.join(dir, 'briefings.db'));
  const briefingId = db.insertBriefing(edition.date, edition.data);
  const app = express();
  app.use(express.json());
  app.use('/api', learningRoutes(db, {
    now: () => new Date('2026-10-25T01:02:03.000Z'),
  }));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const payload = {
    events: [
      { briefing_id: briefingId, story_key: 's100', kind: 'seen' },
      { briefing_id: briefingId, story_key: 's100', kind: 'seen' },
      { briefing_id: briefingId, story_key: 's100', kind: 'opened' },
    ],
  };
  const response = await fetch(base + '/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), { accepted: 3, recorded: 2 });
  assert.deepStrictEqual(db.raw.prepare(`
    SELECT briefing_id, story_key, kind, at, section, kicker, outlets, interest_labels
    FROM story_events ORDER BY kind DESC
  `).all(), [
    {
      briefing_id: briefingId,
      story_key: 's100',
      kind: 'seen',
      at: '2026-10-25T01:02:03.000Z',
      section: 'australia',
      kicker: 'visa reforms',
      outlets: '["r/australia","r/popular"]',
      interest_labels: '[]',
    },
    {
      briefing_id: briefingId,
      story_key: 's100',
      kind: 'opened',
      at: '2026-10-25T01:02:03.000Z',
      section: 'australia',
      kicker: 'visa reforms',
      outlets: '["r/australia","r/popular"]',
      interest_labels: '[]',
    },
  ]);

  const invalid = await fetch(base + '/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: [
      { briefing_id: briefingId, story_key: 's100', kind: 'clicked' },
      { briefing_id: briefingId, story_key: 'missing', kind: 'seen' },
    ] }),
  });
  assert.strictEqual(invalid.status, 400);
  assert.deepStrictEqual(await invalid.json(), { error: 'Event 1 has an invalid kind' });
  assert.strictEqual(db.raw.prepare('SELECT COUNT(*) AS count FROM story_events').get().count, 2);

  db.replaceLearnedNudges([{
    feature_type: 'section', feature_value: 'australia', display_value: 'Australia',
    nudge: 0.1, seen_count: 20, weighted_opens: 12, open_rate: 0.6,
    shrunk_rate: 0.55, overall_rate: 0.5, computed_at: '2026-10-25T01:02:03.000Z',
  }]);
  db.setSetting('learning_last_computed_at', '2026-10-25T01:02:03.000Z');
  const forgotten = await fetch(base + '/api/learning', { method: 'DELETE' });
  assert.strictEqual(forgotten.status, 200);
  assert.deepStrictEqual(await forgotten.json(), { ok: true });
  assert.deepStrictEqual({
    events: db.raw.prepare('SELECT COUNT(*) AS count FROM story_events').get().count,
    nudges: db.raw.prepare('SELECT COUNT(*) AS count FROM learned_nudges').get().count,
    computed_at: db.getSetting('learning_last_computed_at'),
  }, { events: 0, nudges: 0, computed_at: null });
});
