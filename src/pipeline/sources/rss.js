'use strict';

const https = require('node:https');
const RSSParser = require('rss-parser');
const WARNING_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

function fetchHttpsIPv4(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      headers: options.headers,
      signal: options.signal,
      family: 4,
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('error', reject);
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          statusText: response.statusMessage || '',
          headers: {
            get(name) {
              const value = response.headers[String(name).toLowerCase()];
              return Array.isArray(value) ? value.join(', ') : (value || null);
            },
          },
          text: async () => body,
        });
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function fetchFeedResponse(source, options, { fetchImpl, ipv4FetchImpl }) {
  try {
    return await fetchImpl(source.url, options);
  } catch (error) {
    // fetch throws only on transport failure (HTTP errors resolve normally).
    // The container has no working IPv6 route, and some feed hosts (seen with
    // feeds.kottke.org) advertise AAAA records that fetch's address selection
    // picks and never recovers from. One retry pinned to IPv4 covers that for
    // any https feed; an abort is a timeout and is not retried.
    if (error && error.name === 'AbortError') throw error;
    if (!/^https:/i.test(String(source.url))) throw error;
    return ipv4FetchImpl(source.url, options);
  }
}

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

function sourceFields(source, defaults = {}) {
  return {
    source_name: source.name,
    source_type: 'rss',
    // Special source kinds have a contractual section regardless of a stale
    // category left on an existing database row.
    default_category: defaults.default_category || source.default_category,
    ...(source.config && source.config.kind ? { source_kind: source.config.kind } : {}),
    ...(source.config && source.config.no_solo_top ? { no_solo_top: true } : {}),
    ...(source.config && source.config.short_ok ? { short_ok: true } : {}),
  };
}

function normaliseFeedItem(item, source, defaults = {}) {
  const title = decodeEntities(item.title || '');
  const description = stripHTML(item.contentSnippet || item.content || '').substring(0, 500);
  return {
    title,
    url: item.link || '',
    external_url: null,
    description,
    image: extractImage(item),
    published: ensureISO(item.isoDate || item.pubDate || null),
    score: null,
    comment_count: null,
    ...sourceFields(source, defaults),
  };
}

const NORTHERN_WARNING_AREA = /\b(?:North East|North West Coast|Central North|Launceston|Tamar|Tasmania|Tasmanian)\b/i;
const LAND_WARNING = /\b(?:severe weather|flood|fire weather|frost|sheep graziers?)\b/i;

async function parseWarningFeed(body, source) {
  const parser = new RSSParser();
  const feed = await parser.parseString(body);
  let isTasAlert = false;
  try { isTasAlert = /(^|\.)alert\.tas\.gov\.au$/i.test(new URL(source.url).hostname); } catch (_) { /* normal filtering below */ }
  if (isTasAlert) {
    return (feed.items || []).map(item => normaliseFeedItem(item, source, { default_category: 'local' }));
  }
  return (feed.items || []).filter(item => {
    const text = `${item.title || ''} ${stripHTML(item.contentSnippet || item.content || '')}`;
    if (/\b(?:marine|coastal waters?|cancellation|cancelled|canceled)\b/i.test(text)) return false;
    if (!LAND_WARNING.test(text) || !NORTHERN_WARNING_AREA.test(text)) return false;
    if (/\bsheep graziers?\b/i.test(text) && !/\bsevere\b/i.test(text)) return false;
    return true;
  }).map(item => normaliseFeedItem(item, source, { default_category: 'local' }));
}

const PRERELEASE = /(?:^|[\s._-])(?:alpha\d*|beta\d*|rc\d*|nightly|develop(?:ment)?|preview|test)(?:$|[\s._-])/i;
const ATTACHED_PRERELEASE = /\d(?:a|b|rc)\d*(?:$|[\s._-])/i;
const RELEASE_IMPORTANCE = /\b(?:security|vulnerabilit(?:y|ies)|CVE-\d{4}-\d+|breaking)\b/i;

function versionOf(text) {
  const match = String(text || '').match(/(?:^|[^\d])v?(\d+)\.(\d+)(?:\.(\d+))?/i);
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] || 0) } : null;
}

async function parseReleaseFeed(body, source) {
  const parser = new RSSParser();
  const feed = await parser.parseString(body);
  const stable = (feed.items || []).filter(item => {
    const label = `${item.title || ''} ${item.link || ''}`;
    return !PRERELEASE.test(label) && !ATTACHED_PRERELEASE.test(label);
  });
  const github = /(^|\.)github\.com$/i.test((() => {
    try { return new URL(source.url).hostname; } catch (_) { return ''; }
  })());
  const versions = stable.map(item => versionOf(`${item.title || ''} ${item.link || ''}`));
  return stable.filter((item, index) => {
    if (!github) return true;
    const text = `${item.title || ''} ${stripHTML(item.contentSnippet || item.content || '')}`;
    if (RELEASE_IMPORTANCE.test(text)) return true;
    const current = versions[index];
    if (!current) return false;
    const previous = versions.slice(index + 1).find(Boolean);
    return Boolean(previous && (current.major !== previous.major || current.minor !== previous.minor));
  }).map(item => normaliseFeedItem(item, source, { default_category: 'homelab' }));
}

async function fetchRSS(source, log, {
  fetchImpl = globalThis.fetch,
  ipv4FetchImpl = fetchHttpsIPv4,
} = {}) {
  const start = Date.now();
  const parser = new RSSParser();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      const requestOptions = {
        headers: {
          'User-Agent': source.config && source.config.kind === 'warning'
            ? WARNING_USER_AGENT
            : 'DailyBriefing/2.0',
        },
        signal: controller.signal,
      };
      response = await fetchFeedResponse(source, requestOptions, { fetchImpl, ipv4FetchImpl });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const body = await response.text();
    const contentType = response.headers.get('content-type') || '';
    if (/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType) ||
        /^\s*\ufeff?\s*(?:<!doctype\s+html\b|<html\b)/i.test(body)) {
      throw new Error('This address returns a web page, not a news feed');
    }

    if (source.config && source.config.kind === 'warning') {
      const items = await parseWarningFeed(body, source);
      items.forEach(item => log.debug('rss', `Parsed item: ${item.title}`, { url: item.url }));
      log.info('rss', `Fetched ${items.length} items from ${source.name}`, { duration_ms: Date.now() - start });
      return { items, error: null };
    }
    if (source.config && source.config.kind === 'release') {
      const items = await parseReleaseFeed(body, source);
      items.forEach(item => log.debug('rss', `Parsed item: ${item.title}`, { url: item.url }));
      log.info('rss', `Fetched ${items.length} items from ${source.name}`, { duration_ms: Date.now() - start });
      return { items, error: null };
    }

    const feed = await parser.parseString(body);
    const items = [];

    for (const item of (feed.items || [])) {
      const normalised = normaliseFeedItem(item, source);

      log.debug('rss', `Parsed item: ${normalised.title}`, { url: item.link });
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

module.exports = {
  fetchRSS,
  stripHTML,
  decodeEntities,
  extractImage,
  ensureISO,
  parseWarningFeed,
  parseReleaseFeed,
  versionOf,
  WARNING_USER_AGENT,
  fetchHttpsIPv4,
};
