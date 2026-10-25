'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
let learning = {};
try { learning = require('../src/learning'); } catch (_) { /* pre-change failure */ }
const {
  MIN_SEEN,
  NUDGE_K,
  NUDGE_LIMIT,
  PSEUDO_SEEN,
  calculateNudge,
  computeNudges,
  eventOpenWeight,
  learningNudge,
} = learning;

test('uses exact full-read weight, ten-observation shrinkage, twenty-seen floor and fifteen-percent caps', () => {
  assert.deepStrictEqual({ MIN_SEEN, NUDGE_K, NUDGE_LIMIT, PSEUDO_SEEN }, {
    MIN_SEEN: 20,
    NUDGE_K: 0.5,
    NUDGE_LIMIT: 0.15,
    PSEUDO_SEEN: 10,
  });
  assert.deepStrictEqual([
    eventOpenWeight({ opened: 1, read_full: 0 }),
    eventOpenWeight({ opened: 1, read_full: 1 }),
    eventOpenWeight({ opened: 0, read_full: 1 }),
  ], [1, 1.5, 0.5]);
  assert.deepStrictEqual([
    calculateNudge(19, 15, 0.4),
    calculateNudge(20, 16, 0.4),
    calculateNudge(20, 2, 0.4),
    calculateNudge(30, 15, 0.4),
  ], [
    null,
    { seen_count: 20, weighted_opens: 16, open_rate: 0.8, shrunk_rate: 2 / 3, nudge: 0.15 },
    { seen_count: 20, weighted_opens: 2, open_rate: 0.1, shrunk_rate: 0.2, nudge: -0.15 },
    { seen_count: 30, weighted_opens: 15, open_rate: 0.5, shrunk_rate: 0.475, nudge: 0.09374999999999994 },
  ]);
});

test('multiplies kicker, best outlet and section, then clamps the story total', () => {
  const story = {
    kicker: 'Gaming',
    section: 'gaming',
    sources: [{ name: 'Liked outlet' }, { name: 'Skipped outlet' }],
  };
  const rows = [
    { feature_type: 'kicker', feature_value: 'gaming', nudge: 0.1 },
    { feature_type: 'outlet', feature_value: 'liked outlet', nudge: 0.1 },
    { feature_type: 'outlet', feature_value: 'skipped outlet', nudge: -0.1 },
    { feature_type: 'section', feature_value: 'gaming', nudge: 0.1 },
  ];
  assert.deepStrictEqual(learningNudge(story, rows), {
    nudge: 0.15,
    factor: 1.15,
    features: [
      { feature_type: 'kicker', feature_value: 'gaming', nudge: 0.1 },
      { feature_type: 'outlet', feature_value: 'liked outlet', nudge: 0.1 },
      { feature_type: 'section', feature_value: 'gaming', nudge: 0.1 },
    ],
  });
});

test('computes complete feature rows from whole story outcomes', () => {
  const stories = [];
  for (let index = 0; index < 20; index++) {
    stories.push({
      seen: 1, opened: 1, read_full: 1,
      kicker: 'gaming', section: 'gaming', outlets: '["Rock Paper Shotgun"]',
    });
    stories.push({
      seen: 1, opened: 0, read_full: 0,
      kicker: 'politics', section: 'world', outlets: '["Daily Telegraph"]',
    });
  }
  assert.deepStrictEqual(computeNudges(stories, '2026-10-25T00:00:00.000Z'), {
    seen_count: 40,
    weighted_opens: 30,
    overall_rate: 0.75,
    nudges: [
      { feature_type: 'kicker', feature_value: 'gaming', display_value: 'gaming', nudge: 0.15, seen_count: 20, weighted_opens: 30, open_rate: 1.5, shrunk_rate: 1.25, overall_rate: 0.75, computed_at: '2026-10-25T00:00:00.000Z' },
      { feature_type: 'kicker', feature_value: 'politics', display_value: 'politics', nudge: -0.15, seen_count: 20, weighted_opens: 0, open_rate: 0, shrunk_rate: 0.25, overall_rate: 0.75, computed_at: '2026-10-25T00:00:00.000Z' },
      { feature_type: 'outlet', feature_value: 'daily telegraph', display_value: 'Daily Telegraph', nudge: -0.15, seen_count: 20, weighted_opens: 0, open_rate: 0, shrunk_rate: 0.25, overall_rate: 0.75, computed_at: '2026-10-25T00:00:00.000Z' },
      { feature_type: 'outlet', feature_value: 'rock paper shotgun', display_value: 'Rock Paper Shotgun', nudge: 0.15, seen_count: 20, weighted_opens: 30, open_rate: 1.5, shrunk_rate: 1.25, overall_rate: 0.75, computed_at: '2026-10-25T00:00:00.000Z' },
      { feature_type: 'section', feature_value: 'gaming', display_value: 'Gaming', nudge: 0.15, seen_count: 20, weighted_opens: 30, open_rate: 1.5, shrunk_rate: 1.25, overall_rate: 0.75, computed_at: '2026-10-25T00:00:00.000Z' },
      { feature_type: 'section', feature_value: 'world', display_value: 'World', nudge: -0.15, seen_count: 20, weighted_opens: 0, open_rate: 0, shrunk_rate: 0.25, overall_rate: 0.75, computed_at: '2026-10-25T00:00:00.000Z' },
    ],
  });
});
