'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { scoreAndFilter } = require('../src/pipeline/scorer');

const log = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const mockSettings = {
  getScoreThreshold: () => 20,
  getMaxCuratedItems: () => 0,
  getPreferences: () => ({ boost_keywords: [], penalty_keywords: [], tone: '', language: '' }),
};

function makeItem(overrides = {}) {
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
    ...overrides,
  };
}

describe('Scorer', () => {
  it('should score recent items higher than old items', () => {
    const recent = makeItem({ title: 'Recent', published: new Date().toISOString() });
    const old = makeItem({ title: 'Old', published: new Date(Date.now() - 47 * 3600000).toISOString() });

    const { passed } = scoreAndFilter([recent, old], mockSettings, log);
    const recentScored = passed.find(i => i.title === 'Recent');
    const oldScored = passed.find(i => i.title === 'Old');

    assert.ok(recentScored.relevance_score > oldScored.relevance_score,
      `Recent (${recentScored.relevance_score}) should score higher than old (${oldScored.relevance_score})`);
  });

  it('should score high-engagement Reddit posts higher than low-engagement', () => {
    const high = makeItem({ title: 'Popular', source_type: 'reddit', score: 10000 });
    const low = makeItem({ title: 'Unpopular', source_type: 'reddit', score: 2 });

    const { passed } = scoreAndFilter([high, low], mockSettings, log);
    const highScored = passed.find(i => i.title === 'Popular');
    const lowScored = passed.find(i => i.title === 'Unpopular');

    assert.ok(highScored.relevance_score > lowScored.relevance_score,
      `High engagement (${highScored.relevance_score}) should score higher than low (${lowScored.relevance_score})`);
  });

  it('should increase score for boost keywords', () => {
    const item = makeItem({ title: 'Linux kernel update', description: 'New features' });

    const noBoost = scoreAndFilter([{ ...item }], mockSettings, log);
    const withBoost = scoreAndFilter([{ ...item }], {
      ...mockSettings,
      getPreferences: () => ({ boost_keywords: ['linux'], penalty_keywords: [], tone: '', language: '' }),
    }, log);

    assert.ok(withBoost.passed[0].relevance_score > noBoost.passed[0].relevance_score,
      'Boost keyword should increase score');
  });

  it('should decrease score for penalty keywords', () => {
    const item = makeItem({ title: 'Celebrity gossip roundup', description: 'Latest news' });

    const noPenalty = scoreAndFilter([{ ...item }], mockSettings, log);
    const withPenalty = scoreAndFilter([{ ...item }], {
      ...mockSettings,
      getPreferences: () => ({ boost_keywords: [], penalty_keywords: ['gossip'], tone: '', language: '' }),
    }, log);

    assert.ok(withPenalty.passed[0].relevance_score < noPenalty.passed[0].relevance_score,
      'Penalty keyword should decrease score');
  });

  it('should filter out items below threshold', () => {
    // Very old item with no engagement bonus — should score low
    const lowItem = makeItem({
      title: 'Ancient news',
      published: new Date(Date.now() - 72 * 3600000).toISOString(),
      source_type: 'rss',
    });

    const highThreshold = {
      ...mockSettings,
      getScoreThreshold: () => 50,
    };

    const { passed, dropped } = scoreAndFilter([lowItem], highThreshold, log);
    assert.strictEqual(passed.length, 0, 'Low-scoring item should not pass high threshold');
    assert.strictEqual(dropped.length, 1, 'Low-scoring item should be dropped');
  });

  it('should give neutral recency score for items without published date', () => {
    const withDate = makeItem({ title: 'Dated', published: new Date(Date.now() - 24 * 3600000).toISOString() });
    const noDate = makeItem({ title: 'Undated', published: null });

    const { passed } = scoreAndFilter([withDate, noDate], mockSettings, log);
    const dated = passed.find(i => i.title === 'Dated');
    const undated = passed.find(i => i.title === 'Undated');

    // 24h old item gets ~20.0 recency, null gets exactly 20
    assert.ok(undated, 'Undated item should pass threshold');
    // Neutral score (20) should be reasonable
    assert.ok(undated.relevance_score >= 20, 'Undated item should get at least neutral score');
  });

  it('should cap output to max_curated_items when set', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ title: `Item ${i}`, published: new Date(Date.now() - i * 3600000).toISOString() })
    );

    const cappedSettings = {
      ...mockSettings,
      getMaxCuratedItems: () => 3,
    };

    const { passed, dropped, stats } = scoreAndFilter(items, cappedSettings, log);
    assert.strictEqual(passed.length, 3, 'Should cap to 3 items');
    assert.strictEqual(stats.capped_count, 7, 'Should report 7 capped items');
    assert.ok(dropped.length >= 7, 'Dropped should include capped items');
  });

  it('should not cap when max_curated_items is 0', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ title: `Item ${i}`, published: new Date().toISOString() })
    );

    const { passed, stats } = scoreAndFilter(items, mockSettings, log);
    assert.strictEqual(passed.length, 10, 'All items should pass with no cap');
    assert.strictEqual(stats.capped_count, 0, 'No items should be capped');
  });
});
