'use strict';

const { Readability } = require('@mozilla/readability');
const { parseHTML } = require('linkedom');

const FETCH_TIMEOUT_MS = 10000;
const CONCURRENCY = 5;
const TOP_COMMENTS = 8;
const USER_AGENT = 'DailyBriefing/2.0';

function isRedditUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return /(^|\.)reddit\.com$/i.test(u.hostname) || /(^|\.)redd\.it$/i.test(u.hostname);
  } catch (_) {
    return false;
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
      signal: controller.signal,
      ...options,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function extractArticle(url, log) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/html|xml|text/i.test(contentType)) {
    throw new Error(`Non-HTML content-type: ${contentType}`);
  }
  const finalUrl = response.url || url;
  const html = await response.text();

  const { document } = parseHTML(html);
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article || !article.textContent) {
    throw new Error('Readability returned no content');
  }

  return {
    article_content: article.textContent.trim(),
    canonical_url: finalUrl,
  };
}

function redditPermalinkUrl(item) {
  // collector.js/sources/reddit.js stores the permalink as `item.url`
  // (format: https://www.reddit.com/r/<sub>/comments/<id>/<slug>/)
  if (!item || !item.url) return null;
  if (!isRedditUrl(item.url)) return null;
  // Strip query/hash and trailing slash, then append .json
  let base = item.url.split('#')[0].split('?')[0];
  if (base.endsWith('/')) base = base.slice(0, -1);
  return `${base}.json?raw_json=1&limit=${TOP_COMMENTS * 3}`;
}

async function extractRedditComments(item, log) {
  const url = redditPermalinkUrl(item);
  if (!url) throw new Error('No reddit permalink available');

  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const json = await response.json();

  // Reddit returns an array: [postListing, commentListing]
  if (!Array.isArray(json) || json.length < 2) {
    throw new Error('Unexpected reddit comments response shape');
  }
  const listing = json[1];
  const children = (listing && listing.data && listing.data.children) || [];

  const comments = [];
  for (const child of children) {
    if (!child || child.kind !== 't1') continue;
    const data = child.data || {};
    if (data.stickied) continue;
    if (!data.body || data.body === '[deleted]' || data.body === '[removed]') continue;
    comments.push({ body: data.body, score: data.score != null ? data.score : 0 });
  }

  comments.sort((a, b) => b.score - a.score);
  return comments.slice(0, TOP_COMMENTS).map(c => c.body);
}

async function processItem(item, log) {
  const result = { articleExtracted: false, commentsExtracted: false, failed: false };

  // Article extraction: for items with an external (non-reddit) URL
  if (item.external_url && !isRedditUrl(item.external_url)) {
    try {
      const { article_content, canonical_url } = await extractArticle(item.external_url, log);
      item.article_content = article_content;
      item.canonical_url = canonical_url;
      result.articleExtracted = true;
    } catch (err) {
      log.warn('pipeline:extract', `Article fetch failed for ${item.external_url}: ${err.message}`);
      result.failed = true;
    }
  }

  // Reddit comments: for reddit items (permalink stored as item.url)
  if (item.source_type === 'reddit' && item.url && isRedditUrl(item.url)) {
    try {
      const top_comments = await extractRedditComments(item, log);
      if (top_comments && top_comments.length > 0) {
        item.top_comments = top_comments;
        result.commentsExtracted = true;
      }
    } catch (err) {
      log.warn('pipeline:extract', `Reddit comments fetch failed for ${item.url}: ${err.message}`);
      result.failed = true;
    }
  }

  return result;
}

async function extract(items, settings, log, emitProgress) {
  const total = items.length;
  const stats = {
    attempted: 0,
    articles_extracted: 0,
    comments_extracted: 0,
    failures: 0,
  };

  if (total === 0) {
    log.info('pipeline:extract', 'Extract: 0 items to process');
    return { items, stats };
  }

  if (emitProgress) emitProgress('extract', 0, total);

  let completed = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= total) return;
      const item = items[idx];
      stats.attempted++;
      try {
        const res = await processItem(item, log);
        if (res.articleExtracted) stats.articles_extracted++;
        if (res.commentsExtracted) stats.comments_extracted++;
        if (res.failed) stats.failures++;
      } catch (err) {
        // processItem is already graceful; defensive catch
        log.warn('pipeline:extract', `Unexpected error processing item: ${err.message}`);
        stats.failures++;
      }
      completed++;
      if (emitProgress) emitProgress('extract', completed, total);
    }
  }

  const workers = [];
  const poolSize = Math.min(CONCURRENCY, total);
  for (let i = 0; i < poolSize; i++) workers.push(worker());
  await Promise.allSettled(workers);

  log.info('pipeline:extract',
    `Extracted ${stats.attempted} items: ${stats.articles_extracted} articles, ${stats.comments_extracted} comment sets, ${stats.failures} failures`);

  return { items, stats };
}

module.exports = { extract, isRedditUrl };
