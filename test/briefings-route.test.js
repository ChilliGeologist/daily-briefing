'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { initDB } = require('../src/db');

const oldEdition = require('./fixtures/stage5-old-edition.json');
const newEdition = require('./fixtures/stage5-new-edition.json');

test('briefing archive and search routes return the complete stage 5 shapes', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-gump-stage5-routes-'));
  const db = initDB(path.join(dir, 'briefings.db'));
  const oldId = db.insertBriefing(oldEdition.date, oldEdition.data);
  const newId = db.insertBriefing(newEdition.date, newEdition.data);
  db.raw.prepare('UPDATE briefings SET created_at = ? WHERE id = ?').run('2026-03-25 06:00:00', oldId);
  db.raw.prepare('UPDATE briefings SET created_at = ? WHERE id = ?').run('2026-10-24 06:00:00', newId);

  const app = express();
  app.use('/api', require('../src/routes/briefings')(db));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const archiveResponse = await fetch(base + '/api/briefings?limit=1');
  assert.strictEqual(archiveResponse.status, 200);
  assert.deepStrictEqual(await archiveResponse.json(), {
    briefings: [
      {
        id: newId,
        date: '2026-10-24',
        headline: "White House says Melania Trump brokered truce for Ukraine city 'on brink of disaster'",
        item_count: 1,
        created_at: '2026-10-24 06:00:00',
      },
      {
        id: oldId,
        date: '2026-03-25',
        headline: "Australia's fuel crisis deepens: waste collection under threat, diesel hits $4.25/L",
        item_count: 1,
        created_at: '2026-03-25 06:00:00',
      },
    ],
  });

  const oldResponse = await fetch(base + '/api/briefing/' + oldId);
  assert.strictEqual(oldResponse.status, 200);
  assert.deepStrictEqual(await oldResponse.json(), {
    id: oldId,
    date: oldEdition.date,
    headline: oldEdition.headline,
    data: oldEdition.data,
    is_latest: false,
  });

  const searchResponse = await fetch(base + '/api/search?q=visa%20regional&limit=10');
  assert.strictEqual(searchResponse.status, 200);
  assert.deepStrictEqual(await searchResponse.json(), {
    query: 'visa regional',
    total: 1,
    has_more: false,
    next_before: null,
    editions: [{
      id: newId,
      date: '2026-10-24',
      headline: "White House says Melania Trump brokered truce for Ukraine city 'on brink of disaster'",
      stories: [{
        key: 's100',
        title: 'Backpackers say visa changes make regional work less attractive',
        kicker: 'Visa reforms',
        section: 'Australia',
        snippet: 'Backpackers say <mark>visa</mark> changes make <mark>regional</mark> work less attractive',
      }],
    }],
  });

  const firstPageResponse = await fetch(base + '/api/search?q=australia&limit=1');
  assert.strictEqual(firstPageResponse.status, 200);
  const firstPage = await firstPageResponse.json();
  assert.deepStrictEqual(firstPage, {
    query: 'australia',
    total: 2,
    has_more: true,
    next_before: Buffer.from(JSON.stringify(['2026-10-24 06:00:00', newId])).toString('base64url'),
    editions: [{
      id: newId,
      date: '2026-10-24',
      headline: "White House says Melania Trump brokered truce for Ukraine city 'on brink of disaster'",
      stories: [{
        key: 's100',
        title: 'Backpackers say visa changes make regional work less attractive',
        kicker: 'Visa reforms',
        section: 'Australia',
        snippet: ' … And not a single word or question in the article about paying <mark>Australians</mark> more to do the job … ',
      }],
    }],
  });

  const olderPageResponse = await fetch(base + '/api/search?q=australia&limit=1&before=' +
    encodeURIComponent(firstPage.next_before));
  assert.strictEqual(olderPageResponse.status, 200);
  assert.deepStrictEqual(await olderPageResponse.json(), {
    query: 'australia',
    total: 2,
    has_more: false,
    next_before: null,
    editions: [{
      id: oldId,
      date: '2026-03-25',
      headline: "Australia's fuel crisis deepens: waste collection under threat, diesel hits $4.25/L",
      stories: [{
        key: 'legacy-story-1',
        title: "Australia's fuel crisis deepens: waste collection under threat, diesel hits $4.25/L",
        kicker: '',
        section: 'Top Stories',
        snippet: '<mark>Australia</mark>&#39;s fuel crisis deepens: waste collection under threat, diesel hits $4.25/L',
      }],
    }],
  });

  const invalidResponse = await fetch(base + '/api/search?q=%22--**');
  assert.strictEqual(invalidResponse.status, 400);
  assert.deepStrictEqual(await invalidResponse.json(), { error: 'Search query is too short' });
});
