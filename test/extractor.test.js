'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extract, extractClusters, isRedditUrl } = require('../src/pipeline/extractor');
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

const LONG_TEXT = 'A substantial sentence about the news event and its consequences. '.repeat(10);
const LONG_HTML = `<!doctype html><html><head><title>Story</title></head><body><article><h1>Story</h1><p>${LONG_TEXT}</p></article></body></html>`;

function cluster(items) {
  return { id: 'cluster', items, lead: items[0], coverage: items.length, outlets: items.map(item => item.outlet) };
}

function clusterItem(url, overrides = {}) {
  return {
    title: 'Story',
    description: 'Description',
    url,
    canonical_url: url,
    outlet: new URL(url).hostname.replace(/^www\./, ''),
    source_name: 'Source',
    source_type: 'rss',
    source_priority: 1,
    ...overrides,
  };
}

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

  describe('extractClusters()', () => {
    const clusterSettings = { getPaywalledHosts: () => ['examiner.com.au', 'themercury.com.au'] };

    it('skips paywalled items even when they have higher priority', async () => {
      const urls = [];
      const input = cluster([
        clusterItem('https://www.examiner.com.au/story/paid', { source_priority: 2 }),
        clusterItem('https://www.abc.net.au/news/free', { source_priority: 1 }),
      ]);
      const result = await extractClusters([input], clusterSettings, log, null, {
        fetchImpl: async url => {
          urls.push(url);
          return makeResponse({ body: LONG_HTML, url });
        },
      });

      assert.deepStrictEqual(urls, ['https://www.abc.net.au/news/free']);
      assert.strictEqual(result.clusters[0].article_url, 'https://www.abc.net.au/news/free');
    });

    it('never fetches a Reddit post page as an article and does not count it as a failure', async () => {
      const urls = [];
      const discussion = cluster([clusterItem('https://www.reddit.com/r/homelab/comments/1x4ezxj/rack_got_out_of_hand')]);
      const linked = cluster([
        clusterItem('https://www.reddit.com/r/news/comments/1x4abcd/paris_market_fire'),
        clusterItem('https://www.abc.net.au/news/paris-fire'),
      ]);
      const result = await extractClusters([discussion, linked], clusterSettings, log, null, {
        fetchImpl: async url => {
          urls.push(url);
          return makeResponse({ body: LONG_HTML, url });
        },
      });

      assert.deepStrictEqual(urls, ['https://www.abc.net.au/news/paris-fire']);
      assert.deepStrictEqual(
        [result.stats.articles, result.stats.discussions, result.stats.failures],
        [1, 1, 0]);
    });

    it('resolves Google News before fetching the publisher article', async () => {
      const urls = [];
      const googleUrl = 'https://news.google.com/rss/articles/CBMiabc?oc=5';
      const input = cluster([clusterItem(googleUrl)]);
      const result = await extractClusters([input], clusterSettings, log, null, {
        fetchImpl: async (url, options = {}) => {
          urls.push(url);
          if (url === 'https://news.google.com/rss/articles/CBMiabc') {
            return makeResponse({ body: '<i data-n-a-sg="SIG" data-n-a-ts="123"></i>', url });
          }
          if (url.includes('batchexecute')) {
            return makeResponse({ body: `[["x","[\\"garturlres\\",\\"https://publisher.test/story\\"]"]]`, url });
          }
          return makeResponse({ body: LONG_HTML, url });
        },
      });

      assert.deepStrictEqual(urls, [
        'https://news.google.com/rss/articles/CBMiabc',
        'https://news.google.com/_/DotsSplashUi/data/batchexecute',
        'https://publisher.test/story',
      ]);
      assert.strictEqual(result.clusters[0].article_url, 'https://publisher.test/story');
      assert.strictEqual(result.stats.gnews_resolved, 1);
    });

    it('does not fetch a paywalled Google News result and uses the next outlet', async () => {
      const googleUrl = 'https://news.google.com/rss/articles/CBMipaid?oc=5';
      const fallbackUrl = 'https://abc.net.au/news/free-version';
      const urls = [];
      const input = cluster([
        clusterItem(googleUrl, { source_priority: 2 }),
        clusterItem(fallbackUrl),
      ]);
      const result = await extractClusters([input], clusterSettings, log, null, {
        fetchImpl: async url => {
          urls.push(url);
          if (url === 'https://news.google.com/rss/articles/CBMipaid') {
            return makeResponse({ body: '<i data-n-a-sg="SIG" data-n-a-ts="123"></i>', url });
          }
          if (url.includes('batchexecute')) {
            return makeResponse({ body: `[["x","[\\"garturlres\\",\\"https://www.themercury.com.au/news/paid-story\\"]"]]`, url });
          }
          return makeResponse({ body: LONG_HTML, url });
        },
      });

      assert.deepStrictEqual(urls, [
        'https://news.google.com/rss/articles/CBMipaid',
        'https://news.google.com/_/DotsSplashUi/data/batchexecute',
        fallbackUrl,
      ]);
      assert.strictEqual(result.clusters[0].article_url, fallbackUrl);
      assert.strictEqual(result.stats.gnews_resolved, 1);
    });

    it('falls back after Google News resolution fails', async () => {
      const googleUrl = 'https://news.google.com/rss/articles/CBMifail';
      const fallbackUrl = 'https://abc.net.au/news/fallback';
      const urls = [];
      const input = cluster([clusterItem(googleUrl), clusterItem(fallbackUrl)]);
      const result = await extractClusters([input], clusterSettings, log, null, {
        fetchImpl: async url => {
          urls.push(url);
          if (url.includes('news.google.com')) return makeResponse({ body: '<html></html>', url });
          return makeResponse({ body: LONG_HTML, url });
        },
      });

      assert.deepStrictEqual(urls, [
        'https://news.google.com/rss/articles/CBMifail',
        fallbackUrl,
      ]);
      assert.strictEqual(result.clusters[0].article_url, fallbackUrl);
      assert.strictEqual(result.stats.gnews_failed, 1);
    });

    it('records one cluster failure when every fetch fails', async () => {
      const input = cluster([clusterItem('https://a.test/one'), clusterItem('https://b.test/two')]);
      const result = await extractClusters([input], clusterSettings, log, null, {
        fetchImpl: async () => { throw new Error('network down'); },
      });

      assert.strictEqual(result.clusters[0].article_text, null);
      assert.strictEqual(result.stats.failures, 1);
    });

    it('tries the next item when extracted text is under 400 characters', async () => {
      const shortUrl = 'https://a.test/short';
      const longUrl = 'https://b.test/long';
      const urls = [];
      const input = cluster([clusterItem(shortUrl, { source_priority: 2 }), clusterItem(longUrl)]);
      const result = await extractClusters([input], clusterSettings, log, null, {
        fetchImpl: async url => {
          urls.push(url);
          const body = url === shortUrl
            ? '<html><body><article><p>Too short to use.</p></article></body></html>'
            : LONG_HTML;
          return makeResponse({ body, url });
        },
      });

      assert.deepStrictEqual(urls, [shortUrl, longUrl]);
      assert.strictEqual(result.clusters[0].article_url, longUrl);
      assert.strictEqual(result.stats.articles, 1);
    });

    it('rejects a redirect from an article to a cookie or subscription wall', async () => {
      const blockedUrl = 'https://publisher.test/news/story';
      const fallbackUrl = 'https://abc.net.au/news/story';
      const urls = [];
      const input = cluster([clusterItem(blockedUrl, { source_priority: 2 }), clusterItem(fallbackUrl)]);
      const result = await extractClusters([input], clusterSettings, log, null, {
        fetchImpl: async url => {
          urls.push(url);
          if (url === blockedUrl) {
            return makeResponse({
              body: LONG_HTML,
              url: 'https://publisher.test/nocookies?a=story',
            });
          }
          return makeResponse({ body: LONG_HTML.replace('Story', 'Fallback story'), url });
        },
      });

      assert.deepStrictEqual(urls, [blockedUrl, fallbackUrl]);
      assert.strictEqual(result.clusters[0].article_url, fallbackUrl);
    });

    it('clears shared leading page text from every affected cluster', async () => {
      const shared = 'This is a generic no-cookies page asking visitors to enable cookies and subscribe. '.repeat(8);
      const inputs = ['a', 'b', 'c'].map(name => cluster([
        clusterItem(`https://${name}.test/story`),
      ]));
      const warnings = [];
      const infos = [];
      const capturingLog = {
        ...log,
        warn(scope, message) { warnings.push([scope, message]); },
        info(scope, message) { infos.push([scope, message]); },
      };

      const result = await extractClusters(inputs, clusterSettings, capturingLog, null, {
        fetchImpl: async url => makeResponse({
          body: `<!doctype html><html><head><title>Wall</title></head><body><article><p>${shared}${url} has a different tail.</p></article></body></html>`,
          url,
        }),
      });

      for (const output of result.clusters) {
        assert.strictEqual(output.article_text, null);
        assert.strictEqual(output.article_html, null);
        assert.strictEqual(output.article_url, null);
      }
      assert.strictEqual(result.stats.articles, 0);
      assert.strictEqual(result.stats.boilerplate_discarded, 3);
      assert.deepStrictEqual(warnings, [[
        'pipeline:extract',
        'Discarded shared page text from a.test for 3 stories',
      ]]);
      assert.match(infos[0][1], /^Extracted 3 stories: .*3 boilerplate discarded$/);
    });

    it('leaves clusters with different leading article text untouched', async () => {
      const inputs = ['a', 'b'].map(name => cluster([
        clusterItem(`https://${name}.test/story`),
      ]));
      const result = await extractClusters(inputs, clusterSettings, log, null, {
        fetchImpl: async url => makeResponse({
          body: `<!doctype html><html><head><title>Story</title></head><body><article><p>${url} ${url.includes('a.test') ? 'Alpha' : 'Bravo'} ${LONG_TEXT}</p></article></body></html>`,
          url,
        }),
      });

      assert.ok(result.clusters[0].article_text);
      assert.ok(result.clusters[1].article_text);
      assert.strictEqual(result.stats.articles, 2);
      assert.strictEqual(result.stats.boilerplate_discarded, 0);
    });
  });
});
