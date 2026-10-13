'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extract, isRedditUrl } = require('../src/pipeline/extractor');
const { redditRequestQueue } = require('../src/reddit-request-queue');

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
  beforeEach(() => {
    redditRequestQueue.reset();
  });

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

    it('happy path: extracts reddit comments from Atom in feed order', async () => {
      const commentsXml = fs.readFileSync(path.join(__dirname, 'fixtures', 'reddit-comments.atom.xml'), 'utf8');
      let requestedUrl;
      globalThis.fetch = async (url) => {
        if (url.includes('reddit.com') && url.includes('.rss')) {
          requestedUrl = url;
          return makeResponse({
            body: commentsXml,
            contentType: 'application/atom+xml; charset=UTF-8',
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
      assert.strictEqual(requestedUrl, 'https://www.reddit.com/r/test/comments/abc/self/.rss');
      assert.deepStrictEqual(result[0].top_comments, [
        'Why is it in the middle of a bedroom? Some of the setups I see here make me want to downsize my already small setup. Yikes.',
        'Space constraints, mostly. Definitely not ideal, but it’s the only place I had room for the rack right now',
        'I’ve always been a renter. This apt is kinda small but after GF moved in , things have been tight Idk why the yikes tbh, unless u think it looks bad then I get it. I like it and even non-IT friends don’t think it’s an eye sore I work in datacenters, I’m an ex-miner w loads of hardware, so having a full sized rack jived w me and my lifestyle Can this be done w/ much smaller form factor stuff ? Yes but I alrdy had 26 GPUs, 5 motherboards , memory , storage. I wanted to use what I already had',
        "That rack has more security than some apartments I've lived in",
        'For real, at this point the servers are safer than I am.',
        'Except for nas, all of that runs on a single cheapish intel nuc box for a family use',
        'Initially; I did this but ran into problem of: It’s so easy to setup that I didn’t feel I learned/understood much or worse I needed a way to tinker on a servic/system without putting other services hosted on that system at risk So, more so for learning purposes and aesthetics , and I am ex crypto miner with 25+ GPUs and hardware ; I figured why not isolate these systems/services in a. Way that my brain can understand all the pipelines',
        'Right by the baseboard heater :( How is the airflow/ventalation on the 4U rack chassis?',
      ]);
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
