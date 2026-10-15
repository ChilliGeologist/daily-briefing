'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assemble } = require('../src/pipeline/assembler');
const { initDB } = require('../src/db');

function story(id, section, headline, extra = {}) {
  return {
    id,
    section,
    headline,
    kicker: `${id} topic`,
    summary: `${id} summary`,
    image: null,
    sources: [{ name: `${id} outlet`, url: `https://${id}.test` }],
    canonical_url: `https://${id}.test/canonical`,
    article_url: `https://${id}.test/article`,
    article_html: `<p>${id}</p>`,
    coverage: 2,
    interest_matches: [{ label: `${id} interest` }],
    written_by: 'ollama:qwen3:8b',
    ...extra,
  };
}

it('assembles top first, ordered non-empty sections, more stories and exact reader fields', () => {
  const s1 = story('s1', 'world', 'Top headline');
  const s2 = story('s2', 'tasmania', 'Local headline', { image: 'https://image.test/2.jpg' });
  const s3 = story('s3', 'tasmania', 'More local');
  const storiesById = new Map([['s1', s1], ['s2', s2], ['s3', s3]]);
  const logs = [];

  assert.deepStrictEqual(assemble({
    top: ['s1'],
    sections: { tasmania: ['s2'], world: ['s1'] },
    more: { tasmania: ['s3'] },
  }, storiesById, {
    writer: 'ollama:qwen3:8b',
    stats: { write: { written: 3 }, edit: { edit_fallback: 'none' } },
    log: { info: (...args) => logs.push(args) },
  }), {
    headline: 'Top headline',
    writer: 'ollama:qwen3:8b',
    stats: { write: { written: 3 }, edit: { edit_fallback: 'none' } },
    sections: [
      {
        id: 'top', title: 'You should know', icon: 'globe',
        items: [{
          id: 's1', title: 'Top headline', kicker: 's1 topic', summary: 's1 summary', significance: 'high', image: null,
          sources: [{ name: 's1 outlet', url: 'https://s1.test' }], canonical_url: 'https://s1.test/canonical', article_url: 'https://s1.test/article',
          article_html: '<p>s1</p>', coverage: 2, interest_labels: ['s1 interest'], written_by: 'ollama:qwen3:8b', reading_time: 1,
        }],
        more: [],
      },
      {
        id: 'tasmania', title: 'Tasmania', icon: 'globe',
        items: [{
          id: 's2', title: 'Local headline', kicker: 's2 topic', summary: 's2 summary', significance: 'medium', image: 'https://image.test/2.jpg',
          sources: [{ name: 's2 outlet', url: 'https://s2.test' }], canonical_url: 'https://s2.test/canonical', article_url: 'https://s2.test/article',
          article_html: '<p>s2</p>', coverage: 2, interest_labels: ['s2 interest'], written_by: 'ollama:qwen3:8b', reading_time: 1,
        }],
        more: [{
          id: 's3', title: 'More local', kicker: 's3 topic', summary: 's3 summary', significance: 'medium', image: null,
          sources: [{ name: 's3 outlet', url: 'https://s3.test' }], canonical_url: 'https://s3.test/canonical', article_url: 'https://s3.test/article',
          article_html: '<p>s3</p>', coverage: 2, interest_labels: ['s3 interest'], written_by: 'ollama:qwen3:8b', reading_time: 1,
        }],
      },
    ],
  });
  assert.deepStrictEqual(logs, [['assembler', 'Assembled briefing: 2 sections, 3 items total']]);
});

it('uses the first written story then the product name as headline fallbacks', () => {
  const first = story('s1', 'world', 'First written');
  assert.deepStrictEqual([
    assemble({ top: [], sections: {}, more: {} }, new Map([['s1', first]]), { writer: 'ollama:qwen', stats: {}, log: { info() {} } }).headline,
    assemble({ top: [], sections: {}, more: {} }, new Map(), { writer: 'ollama:qwen', stats: {}, log: { info() {} } }).headline,
  ], ['First written', 'The Daily Gump']);
});

it('assembles the summary-only reader shape even when an input story still has detail', () => {
  const input = story('s1', 'world', 'Summary-only story', { detail: 'Legacy detail' });
  const result = assemble({ top: ['s1'], sections: {}, more: {} }, new Map([['s1', input]]));

  assert.deepStrictEqual(result.sections[0].items[0], {
    id: 's1', title: 'Summary-only story', kicker: 's1 topic', summary: 's1 summary', significance: 'high', image: null,
    sources: [{ name: 's1 outlet', url: 'https://s1.test' }], canonical_url: 'https://s1.test/canonical', article_url: 'https://s1.test/article',
    article_html: '<p>s1</p>', coverage: 2, interest_labels: ['s1 interest'], written_by: 'ollama:qwen3:8b', reading_time: 1,
  });
});

it('stores capped post text and real top replies only for community stories', () => {
  const community = story('s1', 'internet', 'Community post', {
    source_type: 'reddit',
    source_name: 'Reddit',
    description: 'p'.repeat(6005),
    top_comments: [
      'Expand the replies to this comment to learn how AI was used in this post/project.',
      'a'.repeat(1005), 'Two', 'Three', 'Four', 'Five', 'Six',
    ],
  });
  const regular = story('s2', 'world', 'Regular story', {
    description: 'Publisher teaser', top_comments: ['Not a community reply'],
  });
  const result = assemble({
    top: [], sections: { internet: ['s1'], world: ['s2'] }, more: {},
  }, new Map([['s1', community], ['s2', regular]]));
  const communityItem = result.sections.find(section => section.id === 'internet').items[0];
  const regularItem = result.sections.find(section => section.id === 'world').items[0];

  assert.deepStrictEqual({
    community: communityItem,
    regular: regularItem,
  }, {
    community: {
      id: 's1', title: 'Community post', kicker: 's1 topic', summary: 's1 summary', significance: 'medium', image: null,
      sources: [{ name: 's1 outlet', url: 'https://s1.test' }], canonical_url: 'https://s1.test/canonical', article_url: 'https://s1.test/article',
      article_html: '<p>s1</p>', coverage: 2, interest_labels: ['s1 interest'], written_by: 'ollama:qwen3:8b', reading_time: 1,
      description: 'p'.repeat(6000), top_comments: ['a'.repeat(1000), 'Two', 'Three', 'Four', 'Five'],
    },
    regular: {
      id: 's2', title: 'Regular story', kicker: 's2 topic', summary: 's2 summary', significance: 'medium', image: null,
      sources: [{ name: 's2 outlet', url: 'https://s2.test' }], canonical_url: 'https://s2.test/canonical', article_url: 'https://s2.test/article',
      article_html: '<p>s2</p>', coverage: 2, interest_labels: ['s2 interest'], written_by: 'ollama:qwen3:8b', reading_time: 1,
    },
  });
});

it('counts regular and more items when a briefing is inserted', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-gump-db-'));
  const db = initDB(path.join(dir, 'briefings.db'));
  t.after(() => {
    db.raw.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  db.insertBriefing('2026-10-13', {
    headline: 'Headline',
    sections: [
      { id: 'top', items: [{ id: 's1' }], more: [] },
      { id: 'world', items: [{ id: 's2' }], more: [{ id: 's3' }, { id: 's4' }] },
    ],
  });
  assert.strictEqual(db.getLatestBriefing().item_count, 4);
});
