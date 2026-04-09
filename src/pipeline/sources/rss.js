'use strict';

const RSSParser = require('rss-parser');

function stripHTML(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function extractImage(item) {
  // Check enclosure with image type
  if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
    return item.enclosure.url;
  }
  // Check media:content
  if (item['media:content'] && item['media:content']['$'] && item['media:content']['$'].url) {
    return item['media:content']['$'].url;
  }
  // Check media:thumbnail
  if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$'].url) {
    return item['media:thumbnail']['$'].url;
  }
  return null;
}

function ensureISO(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

async function fetchRSS(source, log) {
  const start = Date.now();
  const parser = new RSSParser({
    requestOptions: { timeout: 15000 },
  });

  try {
    const feed = await parser.parseURL(source.url);
    const items = [];

    for (const item of (feed.items || [])) {
      const title = decodeEntities(item.title || '');
      const description = stripHTML(item.contentSnippet || item.content || '').substring(0, 500);
      const image = extractImage(item);
      const published = ensureISO(item.isoDate || item.pubDate || null);

      const normalised = {
        title,
        url: item.link || '',
        external_url: null,
        description,
        image,
        published,
        score: null,
        comment_count: null,
        source_name: source.name,
        source_type: 'rss',
        default_category: source.default_category,
      };

      log.debug('rss', `Parsed item: ${title}`, { url: item.link });
      items.push(normalised);
    }

    const duration = Date.now() - start;
    log.info('rss', `Fetched ${items.length} items from ${source.name}`, { duration_ms: duration });

    return { items, error: null };
  } catch (err) {
    const duration = Date.now() - start;
    log.error('rss', `Failed to fetch ${source.name}: ${err.message}`, { duration_ms: duration });
    return { items: [], error: err.message };
  }
}

module.exports = { fetchRSS, stripHTML, decodeEntities, extractImage, ensureISO };
