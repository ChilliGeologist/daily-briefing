'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { dedup, diceSimilarity } = require('../src/pipeline/dedup');

const log = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const mockSettings = {
  getOllamaModel: () => 'test-model',
};

function makeScoredItem(overrides = {}) {
  return {
    title: 'Test Article',
    url: 'https://example.com/test',
    description: 'A test article description',
    image: null,
    published: new Date().toISOString(),
    score: null,
    comment_count: null,
    source_name: 'Test Source',
    source_type: 'rss',
    default_category: 'general',
    relevance_score: 50,
    ...overrides,
  };
}

describe('Dedup', () => {
  describe('diceSimilarity', () => {
    it('should return 1 for identical titles', () => {
      const sim = diceSimilarity('Breaking news today', 'Breaking news today');
      assert.strictEqual(sim, 1);
    });

    it('should return high similarity for similar titles', () => {
      const sim = diceSimilarity(
        'Apple releases new iPhone 16 with AI features',
        'Apple releases the new iPhone 16 featuring AI'
      );
      assert.ok(sim > 0.6, `Similarity ${sim} should be > 0.6`);
    });

    it('should return low similarity for dissimilar titles', () => {
      const sim = diceSimilarity(
        'Apple releases new iPhone',
        'Russia launches space mission to Mars'
      );
      assert.ok(sim < 0.3, `Similarity ${sim} should be < 0.3`);
    });
  });

  describe('clustering', () => {
    it('should cluster identical titles together', async () => {
      const items = [
        makeScoredItem({ title: 'Big Event Happens Today', source_name: 'Source A', url: 'https://a.com/1', relevance_score: 60 }),
        makeScoredItem({ title: 'Big Event Happens Today', source_name: 'Source B', url: 'https://b.com/1', relevance_score: 50 }),
      ];

      const { items: result, stats } = await dedup(items, null, mockSettings, log);
      assert.strictEqual(result.length, 1, 'Identical titles should merge into one');
      assert.strictEqual(stats.confirmed, 1);
    });

    it('should cluster similar titles (>0.6 Dice) together', async () => {
      const items = [
        makeScoredItem({ title: 'New study shows coffee improves health outcomes', source_name: 'Source A', url: 'https://a.com/1', relevance_score: 60 }),
        makeScoredItem({ title: 'New study reveals coffee improves health results', source_name: 'Source B', url: 'https://b.com/1', relevance_score: 50 }),
      ];

      const sim = diceSimilarity(items[0].title, items[1].title);
      assert.ok(sim > 0.6, `Precondition: similarity ${sim} should be > 0.6`);

      const { items: result } = await dedup(items, null, mockSettings, log);
      assert.strictEqual(result.length, 1, 'Similar titles should merge');
    });

    it('should not cluster dissimilar titles', async () => {
      const items = [
        makeScoredItem({ title: 'Apple releases new iPhone', source_name: 'Source A', url: 'https://a.com/1' }),
        makeScoredItem({ title: 'Russia launches space mission', source_name: 'Source B', url: 'https://b.com/1' }),
      ];

      const { items: result } = await dedup(items, null, mockSettings, log);
      assert.strictEqual(result.length, 2, 'Dissimilar titles should not merge');
    });

    it('should pick highest-scored item title for merged cluster', async () => {
      const items = [
        makeScoredItem({ title: 'Big Event Happens Today', source_name: 'Low', url: 'https://low.com', relevance_score: 30 }),
        makeScoredItem({ title: 'Big Event Happens Today', source_name: 'High', url: 'https://high.com', relevance_score: 80 }),
      ];

      const { items: result } = await dedup(items, null, mockSettings, log);
      assert.strictEqual(result[0].url, 'https://high.com', 'Should use URL from highest-scored item');
    });

    it('should combine all sources into array', async () => {
      const items = [
        makeScoredItem({ title: 'Shared Story Breaking Now', source_name: 'Alpha', url: 'https://alpha.com/1', relevance_score: 60 }),
        makeScoredItem({ title: 'Shared Story Breaking Now', source_name: 'Beta', url: 'https://beta.com/1', relevance_score: 50 }),
        makeScoredItem({ title: 'Shared Story Breaking Now', source_name: 'Gamma', url: 'https://gamma.com/1', relevance_score: 40 }),
      ];

      const { items: result } = await dedup(items, null, mockSettings, log);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].sources.length, 3, 'Should have 3 sources');
      const names = result[0].sources.map(s => s.name);
      assert.ok(names.includes('Alpha'));
      assert.ok(names.includes('Beta'));
      assert.ok(names.includes('Gamma'));
    });

    it('should wrap single items in source array format', async () => {
      const items = [
        makeScoredItem({ title: 'Unique Story', source_name: 'Solo', url: 'https://solo.com/1' }),
      ];

      const { items: result } = await dedup(items, null, mockSettings, log);
      assert.strictEqual(result.length, 1);
      assert.ok(Array.isArray(result[0].sources), 'Should have sources array');
      assert.strictEqual(result[0].sources.length, 1);
      assert.strictEqual(result[0].sources[0].name, 'Solo');
      assert.ok(Array.isArray(result[0].merged_descriptions), 'Should have merged_descriptions array');
    });

    it('should merge items sharing canonical_url via URL pre-pass without LLM', async () => {
      const items = [
        makeScoredItem({
          title: 'Totally different title one',
          source_name: 'Source A',
          url: 'https://a.com/x',
          canonical_url: 'https://canonical.example.com/article/123',
          relevance_score: 40,
        }),
        makeScoredItem({
          title: 'Completely unrelated headline two',
          source_name: 'Source B',
          url: 'https://b.com/y',
          canonical_url: 'https://canonical.example.com/article/123',
          relevance_score: 70,
        }),
        makeScoredItem({
          title: 'Some other story entirely',
          source_name: 'Source C',
          url: 'https://c.com/z',
          relevance_score: 50,
        }),
      ];

      const { items: result, stats } = await dedup(items, null, mockSettings, log);
      assert.strictEqual(stats.url_matches, 1, 'one duplicate removed by URL pass');
      assert.strictEqual(result.length, 2, 'three items collapse to two');
      const merged = result.find(r => r.sources && r.sources.length === 2);
      assert.ok(merged, 'should have a merged item with 2 sources');
      assert.strictEqual(merged.url, 'https://b.com/y', 'highest-scored item wins');
    });

    it('should fall back to external_url when canonical_url is missing, normalize query/trailing slash', async () => {
      const items = [
        makeScoredItem({
          title: 'Title alpha',
          source_name: 'Source A',
          url: 'https://a.com/x',
          external_url: 'https://Example.COM/path/?utm_source=foo',
          relevance_score: 40,
        }),
        makeScoredItem({
          title: 'Title beta',
          source_name: 'Source B',
          url: 'https://b.com/y',
          external_url: 'https://example.com/path?ref=bar',
          relevance_score: 60,
        }),
      ];

      const { items: result, stats } = await dedup(items, null, mockSettings, log);
      assert.strictEqual(stats.url_matches, 1);
      assert.strictEqual(result.length, 1);
    });

    it('should not crash on null/undefined/invalid URLs', async () => {
      const items = [
        makeScoredItem({ title: 'Apple releases new iPhone', source_name: 'A', url: 'https://a.com/1', canonical_url: undefined, external_url: null }),
        makeScoredItem({ title: 'Russia launches space mission', source_name: 'B', url: 'https://b.com/1', canonical_url: 'not a url' }),
      ];
      const { items: result, stats } = await dedup(items, null, mockSettings, log);
      assert.strictEqual(stats.url_matches, 0);
      assert.strictEqual(result.length, 2);
    });

    it('should handle transitive clustering (A~B, B~C -> all one cluster)', async () => {
      // A and C may not be directly similar, but both are similar to B
      const items = [
        makeScoredItem({ title: 'The government announces major new policy reform today', source_name: 'A', url: 'https://a.com', relevance_score: 40 }),
        makeScoredItem({ title: 'The government announces major new policy reform plan', source_name: 'B', url: 'https://b.com', relevance_score: 60 }),
        makeScoredItem({ title: 'Government announces major new policy reform plan details', source_name: 'C', url: 'https://c.com', relevance_score: 50 }),
      ];

      // Verify A~B and B~C are similar
      const abSim = diceSimilarity(items[0].title, items[1].title);
      const bcSim = diceSimilarity(items[1].title, items[2].title);
      assert.ok(abSim > 0.6, `A~B similarity ${abSim} should be > 0.6`);
      assert.ok(bcSim > 0.6, `B~C similarity ${bcSim} should be > 0.6`);

      const { items: result } = await dedup(items, null, mockSettings, log);
      assert.strictEqual(result.length, 1, 'All three should merge transitively');
      assert.strictEqual(result[0].sources.length, 3, 'Merged item should have 3 sources');
    });
  });
});
