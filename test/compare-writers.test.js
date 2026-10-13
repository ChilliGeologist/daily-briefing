'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { parseHTML } = require('linkedom');
const { buildCompareHtml, escapeHtml } = require('../scripts/compare-writers');

it('escapes every HTML-sensitive character', () => {
  assert.strictEqual(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});

it('builds a self-contained responsive comparison with exact metrics, top picks and story rows', () => {
  const originals = [
    { id: 's1', title: '<Original & one>' },
    { id: 's2', title: 'Original two' },
  ];
  const results = [
    {
      name: 'anthropic:<model>',
      originals,
      stories: [{
        id: 's1', write_ok: true, kicker: '<World>', headline: 'Headline & one',
        summary: 'Summary "one"', detail: `Detail 'one'`,
      }],
      dropped: [{ id: 's2', write_ok: true }],
      top: ['s1'],
      stats: { written: 1, failures: 0, not_news: 1, input_tokens: 10, output_tokens: 5, cost_usd: 0.014, duration_ms: 20 },
      error: null,
    },
    {
      name: 'ollama:qwen3:8b',
      originals,
      stories: [{ id: 's1', write_ok: false }],
      dropped: [],
      top: [],
      stats: { written: 0, failures: 1, not_news: 0, input_tokens: 3, output_tokens: 1, cost_usd: 0, duration_ms: 1500 },
      error: 'model <offline>',
    },
  ];

  const html = buildCompareHtml(results);
  const { document } = parseHTML(html);
  const text = selector => [...document.querySelectorAll(selector)].map(node => node.textContent);

  assert.strictEqual(document.title, 'Writer comparison');
  assert.deepStrictEqual(text('link, script'), []);
  assert.strictEqual(document.querySelectorAll('style').length, 1);
  assert.deepStrictEqual(text('.writer-header h2'), ['anthropic:<model>', 'ollama:qwen3:8b']);
  assert.deepStrictEqual(text('.metrics'), [
    '1 written · 0 failures · 1 not-news · 10 input / 5 output tokens · $0.01 edition / $0.42 month · 20 ms',
    '0 written · 1 failure · 0 not-news · 3 input / 1 output tokens · $0.00 edition / $0.00 month · 1.50 s',
  ]);
  assert.deepStrictEqual(text('.writer-error'), ['Failure: model <offline>']);
  assert.deepStrictEqual(text('.top-column h3'), ['anthropic:<model>', 'ollama:qwen3:8b']);
  assert.deepStrictEqual(text('.top-column .empty'), ['No top picks']);
  assert.deepStrictEqual(text('.story-card .kicker, .story-card .headline, .story-card .summary, .story-card .detail'), [
    '<World>', 'Headline & one', 'Summary "one"', `Detail 'one'`,
  ]);
  assert.deepStrictEqual(text('.story-row .original-title'), ['<Original & one>', 'Original two']);
  assert.strictEqual(document.querySelector('.story-row .original-title').innerHTML, '&lt;Original &amp; one&gt;');
  assert.deepStrictEqual(text('.story-cell .missing'), ['Failed', 'Not news', 'Failed']);
});
