'use strict';

const RSSParser = require('rss-parser');
const { redditRequestQueue } = require('../../reddit-request-queue');

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const parser = new RSSParser({
  customFields: {
    item: [
      ['id', 'id'],
      ['media:thumbnail', 'media:thumbnail'],
    ],
  },
});

function subredditName(source) {
  return (source.url || '').replace(/^\/?r\//, '').trim();
}

function isRedditUrl(url) {
  if (!url) return false;
  try {
    const hostname = new URL(url, 'https://www.reddit.com').hostname;
    return /(^|\.)reddit\.com$/i.test(hostname) || /(^|\.)redd\.it$/i.test(hostname);
  } catch (_) {
    return false;
  }
}

function decodeAttribute(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;|&#x27;/g, "'");
}

function extractExternalUrl(item) {
  const content = item.content || '';
  const matches = [...content.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>\s*\[link\]\s*<\/a>/gi)];
  if (matches.length === 0) return null;

  try {
    const href = decodeAttribute(matches[matches.length - 1][1]);
    const url = new URL(href, 'https://www.reddit.com').href;
    return isRedditUrl(url) ? null : url;
  } catch (_) {
    return null;
  }
}

function extractDescription(item) {
  const text = item.contentSnippet || '';
  return text
    .replace(/\s*submitted by\s+[\s\S]*?\[link\]\s+\[comments\]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
}

function extractImage(item) {
  const thumbnail = item && item['media:thumbnail'];
  return thumbnail && thumbnail.$ && thumbnail.$.url ? thumbnail.$.url : null;
}

function publishedDate(item) {
  const value = item.isoDate || item.pubDate;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function parseRedditFeed(xml, source, now = Date.now()) {
  const feed = await parser.parseString(xml);
  const sub = subredditName(source);
  const cutoff = now - MAX_AGE_MS;
  const items = [];

  for (const item of (feed.items || [])) {
    const published = publishedDate(item);
    if (published && Date.parse(published) < cutoff) continue;

    items.push({
      title: item.title || '',
      url: item.link || '',
      external_url: extractExternalUrl(item),
      description: extractDescription(item),
      image: extractImage(item),
      published,
      score: null,
      comment_count: null,
      source_name: `r/${sub}`,
      source_type: 'reddit',
      default_category: source.default_category,
    });
  }

  return items;
}

async function fetchReddit(source, log) {
  const start = Date.now();
  const sub = subredditName(source);

  try {
    const sort = (source.config && source.config.sort) || 'hot';
    const limit = (source.config && source.config.limit) || 25;
    const url = `https://www.reddit.com/r/${sub}/${sort}/.rss?limit=${limit}`;
    const response = await redditRequestQueue.fetch(url, { log, timeoutMs: 15000 });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const items = await parseRedditFeed(await response.text(), source, Date.now());
    for (const item of items) {
      log.debug('reddit', `Parsed post: ${item.title}`, { url: item.url });
    }

    const duration = Date.now() - start;
    log.info('reddit', `Fetched ${items.length} items from r/${sub}`, { duration_ms: duration });
    return { items, error: null };
  } catch (err) {
    const duration = Date.now() - start;
    log.error('reddit', `Failed to fetch Reddit source ${source.name}: ${err.message}`, { duration_ms: duration });
    return { items: [], error: err.message };
  }
}

module.exports = {
  fetchReddit,
  extractImage,
  extractExternalUrl,
  extractDescription,
  parseRedditFeed,
};
