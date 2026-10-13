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
      name: 'ollama:<model>',
      originals,
      stories: [{
        id: 's1', write_ok: true, kicker: '<World>', headline: 'Headline & one',
        summary: 'Summary "one"', detail: `Detail 'one'`,
      }],
      dropped: [{ id: 's2', write_ok: true }],
      top: ['s1'],
      stats: { written: 1, repairs: 1, fallbacks: 0, not_news: 1, input_tokens: 10, output_tokens: 5, duration_ms: 20, edit_fallback: 'partial' },
      editor_problems: ['Story s1 was already selected for top'],
      error: null,
    },
    {
      name: 'ollama:qwen3:8b',
      originals,
      stories: [{ id: 's1', write_ok: false }],
      dropped: [],
      top: [],
      stats: { written: 0, repairs: 0, fallbacks: 1, not_news: 0, input_tokens: 3, output_tokens: 1, duration_ms: 1500, edit_fallback: 'full' },
      error: 'model <offline>',
    },
  ];

  const html = buildCompareHtml(results);
  const { document } = parseHTML(html);
  const text = selector => [...document.querySelectorAll(selector)].map(node => node.textContent);

  assert.strictEqual(document.title, 'Writer comparison');
  assert.deepStrictEqual(text('link, script'), []);
  assert.strictEqual(document.querySelectorAll('style').length, 1);
  assert.deepStrictEqual(text('.writer-header h2'), ['ollama:<model>', 'ollama:qwen3:8b']);
  assert.deepStrictEqual(text('.metrics'), [
    '1 written · 1 repair · 0 fallbacks · 1 not-news · editor fallback: partial · 10 input / 5 output tokens · 20 ms',
    '0 written · 0 repairs · 1 fallback · 0 not-news · editor fallback: full · 3 input / 1 output tokens · 1.50 s',
  ]);
  assert.deepStrictEqual(text('.writer-error'), ['Failure: model <offline>']);
  assert.deepStrictEqual(text('.top-column h3'), ['ollama:<model>', 'ollama:qwen3:8b']);
  assert.deepStrictEqual(text('.top-column .empty'), ['No top picks']);
  assert.deepStrictEqual(text('.story-card .kicker, .story-card .headline, .story-card .summary, .story-card .detail'), [
    '<World>', 'Headline & one', 'Summary "one"', `Detail 'one'`,
  ]);
  assert.deepStrictEqual(text('.story-row .original-title'), ['<Original & one>', 'Original two']);
  assert.strictEqual(document.querySelector('.story-row .original-title').innerHTML, '&lt;Original &amp; one&gt;');
  assert.deepStrictEqual(text('.story-cell .missing'), ['Failed', 'Not news', 'Failed']);
  assert.deepStrictEqual(text('.editor-problems'), ['Story s1 was already selected for top']);
});

it('shows escaped writer validation problems below failed and repaired stories', () => {
  const originals = [{ id: 's1', title: 'Original' }, { id: 's2', title: 'Second' }];
  const html = buildCompareHtml([{
    name: 'writer', originals,
    stories: [
      { id: 's1', write_ok: false, write_problems: ['Kicker <too long>'] },
      { id: 's2', write_ok: true, write_problems: ['Unknown section: space'], kicker: 'Topic', headline: 'Headline', summary: 'Summary.', detail: 'Detail.' },
    ],
    dropped: [], top: [], stats: {}, editor_problems: [], error: null,
  }]);
  const { document } = parseHTML(html);
  assert.deepStrictEqual([...document.querySelectorAll('.story-problems')].map(node => node.textContent), [
    'Kicker <too long>',
    'Unknown section: space',
  ]);
  assert.deepStrictEqual([...document.querySelectorAll('.story-cell .missing')].map(node => node.textContent), ['Failed', 'Repaired']);
  assert.match(html, /Kicker &lt;too long&gt;/);
});
