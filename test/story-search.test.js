'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { initDB } = require('../src/db');
const readingLogic = require('../public/reading-logic');
const {
  ensureStorySearch,
  indexBriefingRow,
  sanitiseSearchQuery,
  searchStories,
  storyEntries,
} = require('../src/story-search');

const oldEdition = require('./fixtures/stage5-old-edition.json');
const newEdition = require('./fixtures/stage5-new-edition.json');

function memorySearchDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE briefings (
      id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,
      headline TEXT,
      data TEXT,
      item_count INTEGER DEFAULT 0,
      created_at TEXT
    )
  `);
  ensureStorySearch(sqlite);
  return sqlite;
}

test('sanitises punctuation, FTS operators, unicode and empty queries into quoted prefixes', () => {
  assert.deepStrictEqual([
    sanitiseSearchQuery('plex'),
    sanitiseSearchQuery('  west tamar  '),
    sanitiseSearchQuery('AND NEAR "quoted" * -minus'),
    sanitiseSearchQuery('café 東京'),
    sanitiseSearchQuery('"AND -'),
    sanitiseSearchQuery(' --*** '),
    sanitiseSearchQuery(''),
  ], [
    '"plex"*',
    '"west"* AND "tamar"*',
    '"AND"* AND "NEAR"* AND "quoted"* AND "minus"*',
    '"café"* AND "東京"*',
    '"AND"*',
    '',
    '',
  ]);
});

test('server story keys are the same whole sequence as the reading screen for old and new items', () => {
  const combined = [
    newEdition.data.sections[0],
    oldEdition.data.sections[0],
  ];
  const client = readingLogic.storyEntries(combined).map(({ key, item, section }) => ({
    key, title: item.title, section: section.title,
  }));
  const server = storyEntries(combined).map(({ key, item, section }) => ({
    key, title: item.title, section: section.title,
  }));

  assert.deepStrictEqual(server, client);
  assert.deepStrictEqual(server, [
    {
      key: 's100',
      title: 'Backpackers say visa changes make regional work less attractive',
      section: 'Australia',
    },
    {
      key: 'legacy-story-1',
      title: "Australia's fuel crisis deepens: waste collection under threat, diesel hits $4.25/L",
      section: 'Top Stories',
    },
  ]);
});

test('indexes whole old and new values, including Python-repr sources and community text', t => {
  const sqlite = memorySearchDb();
  t.after(() => sqlite.close());
  const logs = [];

  assert.deepStrictEqual(indexBriefingRow(sqlite, {
    ...oldEdition,
    data: JSON.stringify(oldEdition.data),
  }, { warn: message => logs.push(message) }), {
    editionsIndexed: 1,
    storiesIndexed: 1,
    rowsSkipped: 0,
  });
  assert.deepStrictEqual(indexBriefingRow(sqlite, {
    ...newEdition,
    data: JSON.stringify(newEdition.data),
  }, { warn: message => logs.push(message) }), {
    editionsIndexed: 1,
    storiesIndexed: 1,
    rowsSkipped: 0,
  });
  assert.deepStrictEqual(indexBriefingRow(sqlite, {
    id: 999,
    date: '2026-10-25',
    data: '{not json',
  }, { warn: message => logs.push(message) }), {
    editionsIndexed: 0,
    storiesIndexed: 0,
    rowsSkipped: 1,
  });

  assert.deepStrictEqual(sqlite.prepare(`
    SELECT title, kicker, summary, body, outlets, briefing_id, story_key, section, date
    FROM story_search ORDER BY briefing_id
  `).all(), [
    {
      title: "Australia's fuel crisis deepens: waste collection under threat, diesel hits $4.25/L",
      kicker: '',
      summary: 'Waste collectors warn bin services could stop within days as diesel becomes nearly impossible to source, while prices hit $4.25/L in remote areas.',
      body: "The fuel crisis triggered by the US-Israel war on Iran is now hitting essential services hard. Waste collectors say they're operating at unsustainable losses, freight costs are up 40%, and some Tasmanian service stations have run out of unleaded entirely.",
      outlets: 'ABC News Australia ABC',
      briefing_id: 3,
      story_key: 'legacy-story-1',
      section: 'Top Stories',
      date: '2026-03-25',
    },
    {
      title: 'Backpackers say visa changes make regional work less attractive',
      kicker: 'Visa reforms',
      summary: 'Backpackers report that a new ballot system and reduced visa numbers for second and third-year stays are discouraging them from taking regional jobs.',
      body: "Sweeping wine residue from a tank in the heat of the day is no-one's idea of a dream job. The Irish backpacker is willing to get her hands dirty in exchange for a visa. And not a single word or question in the article about paying Australians more to do the job. It came up when the Australian fruit picker farmers got caught out barely paying backpackers for the work. Agri/horticulture awards are just a joke.",
      outlets: 'r/australia r/popular',
      briefing_id: 219,
      story_key: 's100',
      section: 'Australia',
      date: '2026-10-24',
    },
  ]);
  assert.deepStrictEqual(logs, ['Skipped briefing 999: invalid JSON']);
});

test('search groups newest editions first, ranks title matches, caps total and escapes snippets', t => {
  const sqlite = memorySearchDb();
  t.after(() => sqlite.close());
  const rows = [oldEdition, newEdition];
  for (const [index, edition] of rows.entries()) {
    sqlite.prepare('INSERT INTO briefings VALUES (?, ?, ?, ?, ?, ?)').run(
      edition.id, edition.date, edition.headline, JSON.stringify(edition.data), 1,
      `2026-10-${String(20 + index).padStart(2, '0')} 06:00:00`,
    );
    indexBriefingRow(sqlite, { ...edition, data: JSON.stringify(edition.data) });
  }
  sqlite.prepare(`
    INSERT INTO story_search
      (title, kicker, summary, body, outlets, briefing_id, story_key, section, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('<script>alert(1)</script> elsewhere', '', 'Unsafe <b>backpackers</b> summary', '', 'Outlet', 219, 'extra', 'Australia', '2026-10-24');

  assert.deepStrictEqual(searchStories(sqlite, 'backpackers', 2), {
    query: 'backpackers',
    total: 2,
    editions: [{
      id: 219,
      date: '2026-10-24',
      headline: "White House says Melania Trump brokered truce for Ukraine city 'on brink of disaster'",
      stories: [
        {
          key: 's100',
          title: 'Backpackers say visa changes make regional work less attractive',
          kicker: 'Visa reforms',
          section: 'Australia',
          snippet: '<mark>Backpackers</mark> say visa changes make regional work less attractive',
        },
        {
          key: 'extra',
          title: '<script>alert(1)</script> elsewhere',
          kicker: '',
          section: 'Australia',
          snippet: 'Unsafe &lt;b&gt;<mark>backpackers</mark>&lt;/b&gt; summary',
        },
      ],
    }],
  });
});

test('database startup backfills idempotently and archive metadata derives missing counts and headlines', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-gump-stage5-'));
  const dbPath = path.join(dir, 'briefings.db');
  const seed = new Database(dbPath);
  seed.exec(`
    CREATE TABLE briefings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      headline TEXT,
      data TEXT,
      item_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  seed.prepare('INSERT INTO briefings (id, date, headline, data, item_count, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    oldEdition.id, oldEdition.date, null, JSON.stringify(oldEdition.data), 0, '2026-03-25 06:00:00',
  );
  seed.close();

  const db = initDB(dbPath);
  t.after(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  assert.deepStrictEqual(db.storySearchBackfill, {
    editionsIndexed: 1,
    storiesIndexed: 1,
    rowsSkipped: 0,
  });
  assert.deepStrictEqual(db.backfillStorySearch(), {
    editionsIndexed: 0,
    storiesIndexed: 0,
    rowsSkipped: 0,
  });
  assert.deepStrictEqual(db.listBriefings(), [{
    id: 3,
    date: '2026-03-25',
    headline: "Australia's fuel crisis deepens: waste collection under threat, diesel hits $4.25/L",
    item_count: 1,
    created_at: '2026-03-25 06:00:00',
  }]);
});
