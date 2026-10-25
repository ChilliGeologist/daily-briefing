'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { rankClusters, INTEREST_POINTS } = require('../src/pipeline/rank');

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

it('matches interests across cluster items and adds the interest score', () => {
  const story = cluster('ordinary', { coverage: 1, hoursAgo: 1 });
  story.items.push({
    title: 'Alternate angle',
    description: 'A bushfire warning for Beaconsfield residents',
    source_name: 'Other',
    published: new Date(now - 3 * 3600e3).toISOString(),
  });
  const interests = [
    { label: 'Home', kind: 'place', terms: ['Beaconsfield'], weight: 3, urgent: false },
    { label: 'Emergency', kind: 'topic', terms: ['bushfire'], weight: 3, urgent: true },
  ];

  const result = rankClusters([story], { now, limit: 10, interests });

  assert.strictEqual(INTEREST_POINTS, 13);
  assert.strictEqual(result.selected[0].rank_score, 40 + (6 * 13));
  assert.deepStrictEqual(result.selected[0].interest_matches, [
    { label: 'Home', kind: 'place', weight: 3, urgent: false, term: 'Beaconsfield' },
    { label: 'Emergency', kind: 'topic', weight: 3, urgent: true, term: 'bushfire' },
  ]);
});

it('uses interests without the retired keyword boost and penalty settings', () => {
  const story = cluster('Plex outage rumour', { coverage: 1, hoursAgo: 1 });
  story.lead.description = 'clickbait warning';
  const result = rankClusters([story], {
    now,
    limit: 10,
    interests: [{ label: 'Plex', kind: 'product', terms: ['Plex'], weight: 2, urgent: true }],
  });
  assert.strictEqual(result.selected[0].rank_score, 40 + (2 * 13));
});

it('keeps each source category\'s best stories even when bigger categories outrank them', () => {
  const withCategory = (id, category, options) => {
    const value = cluster(id, options);
    value.items[0].default_category = category;
    return value;
  };
  const news = Array.from({ length: 6 }, (_, index) => withCategory(`news${index}`, 'top-stories', { coverage: 4, source: `N${index}` }));
  const culture = Array.from({ length: 3 }, (_, index) => withCategory(`culture${index}`, 'trending', { hoursAgo: 20 + index, source: 'C' }));
  const result = rankClusters([...news, ...culture], { now, limit: 5, perSourceFloor: 0, perCategoryFloor: 2 });
  assert.deepStrictEqual(result.selected.map(value => value.id), ['news0', 'news1', 'news2', 'culture0', 'culture1']);
});
