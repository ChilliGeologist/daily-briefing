'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { normalise } = require('../src/pipeline/normalise');
const { filterItems } = require('../src/pipeline/filter');
const { clusterItems } = require('../src/pipeline/cluster');

const fixtureDir = path.join(__dirname, 'fixtures/day-2026-10-13');
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'collected.json'), 'utf8'));
const expected = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'expect.json'), 'utf8'));
const fillerPatterns = [
  'weather report for', 'magistrates court list', 'superquiz', 'best of cartoons',
  'crossword', 'horoscope', 'as it happened', 'quick quiz', 'word puzzle',
];
const log = { debug() {}, info() {}, warn() {}, error() {} };

function containsPair(cluster, [left, right]) {
  const titles = cluster.items.map(item => item.title);
  if (left === right) return titles.filter(title => title === left).length >= 2;
  return titles.includes(left) && titles.includes(right);
}

it('matches the labelled regression day without model assistance', async () => {
  const priorities = new Map(fixture.sources.map(source => [source.name, source.priority]));
  const sourceMaxAge = new Map(fixture.sources
    .filter(source => source.config && source.config.max_age_hours != null)
    .map(source => [source.name, Number(source.config.max_age_hours)]));
  const withPriorities = fixture.items.map(item => ({
    ...item,
    source_priority: priorities.get(item.source_name) ?? 1,
  }));
  const filtered = filterItems(normalise(withPriorities), {
    maxAgeHours: 36,
    fillerPatterns,
    sourceMaxAge,
    now: Date.parse(fixture.captured_at),
  });
  const result = await clusterItems(filtered.kept, {
    judge: async () => false,
    log,
  });

  assert.deepStrictEqual(
    expected.dropped_filler.map(title => [title, filtered.dropped.some(drop =>
      drop.item.title === title && drop.reason.startsWith('filler: ')
    )]),
    expected.dropped_filler.map(title => [title, true])
  );

  assert.deepStrictEqual(
    expected.same_story.map(pair => [pair, result.clusters.some(cluster => containsPair(cluster, pair))]),
    expected.same_story.map(pair => [pair, true])
  );
  assert.deepStrictEqual(
    expected.different_story.map(pair => [pair, result.clusters.some(cluster => containsPair(cluster, pair))]),
    expected.different_story.map(pair => [pair, false])
  );
});
