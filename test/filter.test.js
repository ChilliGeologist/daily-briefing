'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { filterItems } = require('../src/pipeline/filter');
const { createSettings } = require('../src/settings');

const now = Date.parse('2026-10-13T00:00:00Z');
const opts = (overrides = {}) => ({
  maxAgeHours: 36,
  fillerPatterns: ['weather report for', '/^superquiz,/i'],
  sourceMaxAge: new Map(),
  now,
  ...overrides,
});
const item = (title, hoursAgo, source_name = 'ABC') => ({
  title,
  source_name,
  published: hoursAgo == null ? null : new Date(now - hoursAgo * 3600e3).toISOString(),
});

it('drops items older than the cut-off and keeps undated ones', () => {
  const result = filterItems([item('fresh', 2), item('old', 40), item('undated', null)], opts());
  assert.deepStrictEqual(result.kept.map(value => value.title), ['fresh', 'undated']);
  assert.deepStrictEqual(result.dropped.map(drop => [drop.item.title, drop.reason]), [['old', 'stale']]);
});

it('honours a per-source age override', () => {
  const result = filterItems([item('slow source item', 100, 'Press Start Australia')],
    opts({ sourceMaxAge: new Map([['Press Start Australia', 168]]) }));
  assert.deepStrictEqual(result.kept.map(value => value.title), ['slow source item']);
});

it('drops filler by substring (case-insensitive) and by /regex/flags', () => {
  const result = filterItems([
    item('Weather report for Devonport - The Mercury', 1),
    item('Superquiz, Tuesday, October 13', 1),
    item('Superquiz winner speaks', 1),
  ], opts());
  assert.deepStrictEqual(result.dropped.map(drop => drop.reason), [
    'filler: weather report for',
    'filler: /^superquiz,/i',
  ]);
  assert.deepStrictEqual(result.kept.map(value => value.title), ['Superquiz winner speaks']);
  assert.deepStrictEqual(result.stats, { total: 3, kept: 1, stale: 0, filler: 2 });
});

it('ignores an invalid regex pattern instead of throwing', () => {
  const result = filterItems([item('anything', 1)], opts({ fillerPatterns: ['/([/'] }));
  assert.deepStrictEqual(result.kept.map(value => value.title), ['anything']);
});

it('filters court-list filler using the code defaults', () => {
  const settings = createSettings({ getSetting: () => null });
  const result = filterItems([
    item('Everybody appearing at Hobart Magistrates Court', 1),
  ], opts({ fillerPatterns: settings.getFillerPatterns() }));
  assert.deepStrictEqual(result, {
    kept: [],
    dropped: [{
      item: item('Everybody appearing at Hobart Magistrates Court', 1),
      reason: 'filler: everybody appearing at',
    }],
    stats: { total: 1, kept: 0, stale: 0, filler: 1 },
  });
});
