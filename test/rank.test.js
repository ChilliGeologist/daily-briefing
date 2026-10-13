'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { rankClusters } = require('../src/pipeline/rank');

const now = Date.parse('2026-10-13T00:00:00Z');
const cluster = (id, {
  coverage = 1,
  hoursAgo = 2,
  pos = 50,
  source = 'S',
  priority = 1,
} = {}) => {
  const item = {
    title: id,
    description: '',
    source_name: source,
    source_priority: priority,
    list_position: pos,
    published: new Date(now - hoursAgo * 3600e3).toISOString(),
  };
  return { id, items: [item], lead: item, coverage, outlets: [source] };
};

it('scores coverage, recency and position exactly', () => {
  const result = rankClusters([cluster('x', { coverage: 4, hoursAgo: 1, pos: 2 })], {
    now,
    limit: 10,
  });
  assert.strictEqual(result.selected[0].rank_score, 50 + 40 + 15);
});

it('puts a story carried by four outlets above a fresher single-outlet story', () => {
  const result = rankClusters([
    cluster('single', { hoursAgo: 1 }),
    cluster('big', { coverage: 4, hoursAgo: 12 }),
  ], { now, limit: 10 });
  assert.deepStrictEqual(result.selected.map(value => value.id), ['big', 'single']);
});

it('gives every source a floor of two even when one source floods', () => {
  const flood = Array.from({ length: 10 }, (_, index) => cluster(`flood${index}`, {
    source: '7NEWS',
    hoursAgo: 1,
    pos: 1,
  }));
  const quiet = [
    cluster('q1', { source: 'Examiner', hoursAgo: 30 }),
    cluster('q2', { source: 'Examiner', hoursAgo: 31 }),
    cluster('q3', { source: 'Examiner', hoursAgo: 32 }),
  ];
  const result = rankClusters([...flood, ...quiet], { now, limit: 5 });
  assert.strictEqual(result.selected.length, 5);
  assert.deepStrictEqual(
    result.selected.filter(value => value.lead.source_name === 'Examiner').map(value => value.id).sort(),
    ['q1', 'q2']
  );
  assert.strictEqual(result.stats.floor_added, 2);
});
