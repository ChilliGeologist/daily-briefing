'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const saved = require('./fixtures/stage7-saved-candidates.json');
const { rankClusters } = require('../src/pipeline/rank');
const { deterministicEdit, eligibleTopCandidate } = require('../src/pipeline/writer/validate');

function asCluster(candidate) {
  return {
    id: candidate.id,
    lead: candidate,
    items: [candidate],
    coverage: candidate.coverage,
  };
}

test('a fixed learned outlet nudge changes real saved-candidate order', () => {
  const clusters = saved.candidates.map(asCluster);
  const options = {
    now: Date.parse('2026-10-24T00:00:00.000Z'),
    limit: 2,
    perSourceFloor: 0,
    perCategoryFloor: 0,
  };
  const before = rankClusters(clusters, options);
  const after = rankClusters(clusters, {
    ...options,
    learnedNudges: [{ feature_type: 'outlet', feature_value: 'the register', nudge: 0.15 }],
  });

  assert.deepStrictEqual({
    source_file: saved.source_file,
    before: before.selected.map(story => story.id),
    after: after.selected.map(story => story.id),
    scores: after.selected.map(story => ({
      id: story.id,
      base_rank_score: story.base_rank_score,
      rank_score: story.rank_score,
      learning_nudge: story.learning_nudge,
    })),
  }, {
    source_file: '/app/data/candidates/2026-10-24-3d4bbe23.json',
    before: ['nasa-moon', 'openai-training'],
    after: ['openai-training', 'nasa-moon'],
    scores: [
      { id: 'openai-training', base_rank_score: 60.50000000000001, rank_score: 69.575, learning_nudge: 0.15 },
      { id: 'nasa-moon', base_rank_score: 60.50000000000001, rank_score: 60.50000000000001, learning_nudge: 0 },
    ],
  });
});

test('a nudge never makes a story eligible for You should know', () => {
  const unqualified = {
    id: 'single',
    section: 'tech',
    coverage: 1,
    sources: [{ name: 'The Register' }],
    interest_matches: [],
    learning_nudge: 0.15,
  };
  const qualified = {
    ...unqualified,
    id: 'interest',
    interest_matches: [{ label: 'Plex', kind: 'product', weight: 2 }],
  };
  assert.deepStrictEqual([
    eligibleTopCandidate(unqualified, 0),
    eligibleTopCandidate({ ...unqualified, learning_nudge: 0 }, 0),
    eligibleTopCandidate(qualified, 0),
  ], [false, false, true]);
});

test('You should know is chosen in base order even when learned ranking flips', () => {
  function topCluster(id, source, hoursAgo) {
    const item = {
      title: id,
      description: '',
      source_name: source,
      source_priority: 1,
      default_category: 'world',
      list_position: 2,
      published: new Date(Date.parse('2026-10-24T00:00:00.000Z') - hoursAgo * 3600000).toISOString(),
    };
    return { id, lead: item, items: [item], coverage: 3 };
  }
  const clusters = [topCluster('base-first', 'Plain outlet', 2), topCluster('nudged-first', 'Liked outlet', 7)];
  const options = {
    now: Date.parse('2026-10-24T00:00:00.000Z'),
    limit: 2,
    perSourceFloor: 0,
    perCategoryFloor: 0,
  };
  const before = rankClusters(clusters, options);
  const after = rankClusters(clusters, {
    ...options,
    learnedNudges: [{ feature_type: 'outlet', feature_value: 'liked outlet', nudge: 0.15 }],
  });
  function asWritten(result) {
    return result.selected.map(story => ({
      id: story.id,
      title: story.id,
      headline: story.id,
      section: 'world',
      coverage: story.coverage,
      sources: [{ name: story.lead.source_name }, { name: 'Second' }, { name: 'Third' }],
      interest_matches: [],
      rank: story.rank,
      base_rank: story.base_rank,
    }));
  }
  assert.deepStrictEqual({
    before_order: before.selected.map(story => story.id),
    after_order: after.selected.map(story => story.id),
    after_base_ranks: after.selected.map(story => [story.id, story.base_rank]),
    before_top: deterministicEdit(asWritten(before), { sectionSize: 5, topSize: { min: 1, max: 1 } }).top,
    after_top: deterministicEdit(asWritten(after), { sectionSize: 5, topSize: { min: 1, max: 1 } }).top,
  }, {
    before_order: ['base-first', 'nudged-first'],
    after_order: ['nudged-first', 'base-first'],
    after_base_ranks: [['nudged-first', 2], ['base-first', 1]],
    before_top: ['base-first'],
    after_top: ['base-first'],
  });
});
