'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { extract, isRedditUrl } = require('../src/pipeline/extractor');

const log = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const settings = {};

const originalFetch = globalThis.fetch;

function makeResponse({ ok = true, status = 200, statusText = 'OK', url = 'https://example.com/final', contentType = 'text/html; charset=utf-8', body = '', json = null } = {}) {
  return {
    ok,
    status,
    statusText,
    url,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-type') return contentType;
        return null;
      },
    },
    text: async () => body,
    json: async () => json,
  };
}

const SAMPLE_HTML = `
  <!doctype html>
  <html>
    <head><title>Sample Article</title></head>
    <body>
      <article>
        <h1>Breaking: Big Story</h1>
        <p>This is the first paragraph of a substantial article body that Readability should be able to pick up as main content.</p>
        <p>And here is a second substantial paragraph with additional content to ensure the algorithm recognises this as real article content worth extracting.</p>
        <p>A third paragraph provides even more substance so that the readability scoring clearly identifies this block as the article.</p>
      </article>
    </body>
  </html>
`;

describe('Extractor', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('isRedditUrl', () => {
    it('recognises reddit.com URLs', () => {
      assert.strictEqual(isRedditUrl('https://www.reddit.com/r/news/comments/abc/x/'), true);
      assert.strictEqual(isRedditUrl('https://reddit.com/r/news'), true);
      assert.strictEqual(isRedditUrl('https://old.reddit.com/r/news'), true);
    });

    it('rejects non-reddit URLs', () => {
      assert.strictEqual(isRedditUrl('https://example.com/article'), false);
      assert.strictEqual(isRedditUrl('https://redditfakes.com/'), false);
      assert.strictEqual(isRedditUrl(null), false);
    });
  });

  describe('extract()', () => {
    it('returns items unchanged when no external_url and not a reddit item', async () => {
      let fetchCalls = 0;
      globalThis.fetch = async () => { fetchCalls++; return makeResponse(); };

      const items = [
        { title: 'Plain RSS item', source_type: 'rss', url: 'https://example.com/a' },
      ];

      const { items: result, stats } = await extract(items, settings, log);
      assert.strictEqual(fetchCalls, 0, 'should not fetch anything');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].article_content, undefined);
      assert.strictEqual(result[0].top_comments, undefined);
      assert.strictEqual(stats.attempted, 1);
      assert.strictEqual(stats.articles_extracted, 0);
      assert.strictEqual(stats.failures, 0);
    });

    it('handles fetch failure gracefully (no throw, failures incremented)', async () => {
      globalThis.fetch = async () => { throw new Error('network down'); };

      const items = [
        {
          title: 'Link post',
          source_type: 'reddit',
          url: 'https://www.reddit.com/r/news/comments/abc/x/',
          external_url: 'https://example.com/article',
        },
      ];

      const { items: result, stats } = await extract(items, settings, log);
      assert.strictEqual(result[0].article_content, undefined);
      assert.strictEqual(result[0].top_comments, undefined);
      assert.ok(stats.failures >= 1, `expected failures >= 1, got ${stats.failures}`);
      assert.strictEqual(stats.articles_extracted, 0);
      assert.strictEqual(stats.comments_extracted, 0);
    });

    it('happy path: populates article_content and canonical_url from mocked HTML', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('example.com')) {
          return makeResponse({
            body: SAMPLE_HTML,
            url: 'https://example.com/article-final',
            contentType: 'text/html',
          });
        }
        throw new Error(`unexpected URL: ${url}`);
      };

      const items = [
        {
          title: 'News story',
          source_type: 'rss',
          url: 'https://rss.example.com/1',
          external_url: 'https://example.com/article',
        },
      ];

      const { items: result, stats } = await extract(items, settings, log);
      assert.ok(result[0].article_content, 'article_content should be set');
      assert.ok(result[0].article_content.includes('first paragraph'), 'article_content should include body text');
      assert.strictEqual(result[0].canonical_url, 'https://example.com/article-final');
      assert.strictEqual(stats.articles_extracted, 1);
      assert.strictEqual(stats.failures, 0);
    });

    it('happy path: extracts top reddit comments sorted by score', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('reddit.com') && url.includes('.json')) {
          return makeResponse({
            json: [
              { data: { children: [] } },
              {
                data: {
                  children: [
                    { kind: 't1', data: { body: 'low comment', score: 1 } },
                    { kind: 't1', data: { body: 'top comment', score: 100 } },
                    { kind: 't1', data: { body: 'mid comment', score: 50 } },
                    { kind: 't1', data: { body: '[deleted]', score: 999 } },
                    { kind: 'more', data: {} },
                  ],
                },
              },
            ],
          });
        }
        throw new Error(`unexpected URL: ${url}`);
      };

      const items = [
        {
          title: 'Self post',
          source_type: 'reddit',
          url: 'https://www.reddit.com/r/test/comments/abc/self/',
          external_url: null,
        },
      ];

      const { items: result, stats } = await extract(items, settings, log);
      assert.ok(Array.isArray(result[0].top_comments), 'top_comments should be an array');
      assert.strictEqual(result[0].top_comments[0], 'top comment');
      assert.strictEqual(result[0].top_comments[1], 'mid comment');
      assert.ok(!result[0].top_comments.includes('[deleted]'));
      assert.strictEqual(stats.comments_extracted, 1);
    });

    it('emits progress callbacks', async () => {
      globalThis.fetch = async () => makeResponse({ body: SAMPLE_HTML });

      const items = [
        { title: 'A', source_type: 'rss', external_url: 'https://example.com/a' },
        { title: 'B', source_type: 'rss', external_url: 'https://example.com/b' },
        { title: 'C', source_type: 'rss', external_url: 'https://example.com/c' },
      ];

      const progress = [];
      await extract(items, settings, log, (stage, cur, total) => {
        progress.push({ stage, cur, total });
      });

      assert.ok(progress.length >= 4, 'should emit initial + one per item');
      assert.strictEqual(progress[0].stage, 'extract');
      assert.strictEqual(progress[0].cur, 0);
      assert.strictEqual(progress[progress.length - 1].cur, 3);
      assert.strictEqual(progress[progress.length - 1].total, 3);
    });

    it('returns empty stats for empty input', async () => {
      const { items: result, stats } = await extract([], settings, log);
      assert.deepStrictEqual(result, []);
      assert.strictEqual(stats.attempted, 0);
      assert.strictEqual(stats.articles_extracted, 0);
      assert.strictEqual(stats.comments_extracted, 0);
      assert.strictEqual(stats.failures, 0);
    });
  });
});
