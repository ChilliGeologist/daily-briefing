'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const RSSParser = require('rss-parser');
const { fetchRSS, stripHTML, decodeEntities, extractImage, ensureISO } = require('../src/pipeline/sources/rss');

// Minimal logger for tests
const log = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

describe('RSS source', () => {
  it('retries an https feed over IPv4 when the ordinary fetch transport fails', async () => {
    const xml = '<?xml version="1.0"?><rss version="2.0"><channel><title>Kottke</title><item><title>Readable item</title><link>https://kottke.org/item</link></item></channel></rss>';
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('fetch failed'); };
    try {
      const result = await fetchRSS({ name: 'Kottke', url: 'https://feeds.kottke.org/main' }, log, {
        fetchImpl: async url => { calls.push(['ordinary', url]); throw new Error('fetch failed'); },
        ipv4FetchImpl: async (url, options) => {
          calls.push(['ipv4', url, options.headers['User-Agent']]);
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: name => name.toLowerCase() === 'content-type' ? 'text/xml' : null },
            text: async () => xml,
          };
        },
      });

      assert.deepStrictEqual({
        calls,
        error: result.error,
        items: result.items.map(item => ({ title: item.title, url: item.url, source_name: item.source_name })),
      }, {
        calls: [
          ['ordinary', 'https://feeds.kottke.org/main'],
          ['ipv4', 'https://feeds.kottke.org/main', 'DailyBriefing/2.0'],
        ],
        error: null,
        items: [{ title: 'Readable item', url: 'https://kottke.org/item', source_name: 'Kottke' }],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reports a plain error for an HTML content-type', async () => {
    const server = http.createServer((_request, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end('<?xml version="1.0"?><rss version="2.0"><channel><title>Looks valid</title></channel></rss>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    try {
      const address = `http://127.0.0.1:${server.address().port}/news`;
      const result = await fetchRSS({ name: 'Not a feed', url: address }, log);
      assert.deepStrictEqual(result, {
        items: [],
        error: 'This address returns a web page, not a news feed',
      });
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('reports a plain error when the body starts with HTML', async () => {
    const server = http.createServer((_request, response) => {
      response.setHeader('content-type', 'application/xml; charset=utf-8');
      response.end('<!DOCTYPE html><html><body>News & updates</body></html>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    try {
      const address = `http://127.0.0.1:${server.address().port}/news`;
      const result = await fetchRSS({ name: 'Not a feed', url: address }, log);
      assert.deepStrictEqual(result, {
        items: [],
        error: 'This address returns a web page, not a news feed',
      });
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  describe('stripHTML', () => {
    it('should remove HTML tags', () => {
      assert.strictEqual(stripHTML('<p>Hello <b>world</b></p>'), 'Hello world');
    });

    it('should decode HTML entities', () => {
      assert.strictEqual(stripHTML('Tom &amp; Jerry'), 'Tom & Jerry');
      assert.strictEqual(stripHTML('&lt;script&gt;'), '<script>');
    });

    it('should collapse whitespace', () => {
      assert.strictEqual(stripHTML('Hello   \n  world'), 'Hello world');
    });

    it('should return empty string for null/undefined', () => {
      assert.strictEqual(stripHTML(null), '');
      assert.strictEqual(stripHTML(undefined), '');
    });
  });

  describe('decodeEntities', () => {
    it('should decode common HTML entities', () => {
      assert.strictEqual(decodeEntities('A &amp; B'), 'A & B');
      assert.strictEqual(decodeEntities('&quot;hello&quot;'), '"hello"');
    });

    it('should trim whitespace', () => {
      assert.strictEqual(decodeEntities('  hello  '), 'hello');
    });
  });

  describe('extractImage', () => {
    it('should extract from enclosure with image type', () => {
      const item = { enclosure: { url: 'http://img.com/pic.jpg', type: 'image/jpeg' } };
      assert.strictEqual(extractImage(item), 'http://img.com/pic.jpg');
    });

    it('should skip enclosure with non-image type', () => {
      const item = { enclosure: { url: 'http://img.com/audio.mp3', type: 'audio/mpeg' } };
      assert.strictEqual(extractImage(item), null);
    });

    it('should extract from media:content', () => {
      const item = { 'media:content': { '$': { url: 'http://img.com/media.jpg' } } };
      assert.strictEqual(extractImage(item), 'http://img.com/media.jpg');
    });

    it('should extract from media:thumbnail', () => {
      const item = { 'media:thumbnail': { '$': { url: 'http://img.com/thumb.jpg' } } };
      assert.strictEqual(extractImage(item), 'http://img.com/thumb.jpg');
    });

    it('should return null when no image found', () => {
      assert.strictEqual(extractImage({}), null);
    });
  });

  describe('ensureISO', () => {
    it('should convert valid date string to ISO', () => {
      const result = ensureISO('2024-01-15T10:30:00Z');
      assert.strictEqual(result, '2024-01-15T10:30:00.000Z');
    });

    it('should return null for invalid date', () => {
      assert.strictEqual(ensureISO('not-a-date'), null);
    });

    it('should return null for null/undefined', () => {
      assert.strictEqual(ensureISO(null), null);
      assert.strictEqual(ensureISO(undefined), null);
    });
  });

  describe('RSS normalisation via parseString', () => {
    it('should normalise RSS items from XML', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Test Article &amp; More</title>
              <link>https://example.com/article1</link>
              <description>&lt;p&gt;This is a &lt;b&gt;test&lt;/b&gt; article.&lt;/p&gt;</description>
              <pubDate>Mon, 15 Jan 2024 10:30:00 GMT</pubDate>
              <enclosure url="https://example.com/image.jpg" type="image/jpeg" length="12345" />
            </item>
            <item>
              <title>Second Article</title>
              <link>https://example.com/article2</link>
              <description>Plain text description</description>
            </item>
          </channel>
        </rss>`;

      const parser = new RSSParser();
      const feed = await parser.parseString(xml);

      assert.strictEqual(feed.items.length, 2);
      assert.strictEqual(feed.items[0].title, 'Test Article & More');
      assert.strictEqual(feed.items[0].link, 'https://example.com/article1');
      assert.ok(feed.items[0].enclosure);
      assert.strictEqual(feed.items[0].enclosure.url, 'https://example.com/image.jpg');
    });

    it('should truncate long descriptions to 500 chars', () => {
      const longText = 'A'.repeat(600);
      const result = stripHTML(longText).substring(0, 500);
      assert.strictEqual(result.length, 500);
    });
  });
});
