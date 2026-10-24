'use strict';

const { Readability } = require('@mozilla/readability');
const { parseHTML } = require('linkedom');
const RSSParser = require('rss-parser');
const { redditRequestQueue } = require('../reddit-request-queue');
const { isGoogleNewsUrl, resolveGoogleNewsUrl } = require('./gnews');
const { sanitiseHtml } = require('./sanitise');

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

async function fetchWithTimeout(url, options = {}, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
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

async function extractArticle(url, log, fetchImpl = globalThis.fetch) {
  const response = await fetchWithTimeout(url, {}, fetchImpl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/html|xml|text/i.test(contentType)) {
    throw new Error(`Non-HTML content-type: ${contentType}`);
  }
  const finalUrl = response.url || url;
  if (redirectedToAccessWall(url, finalUrl)) {
    throw new Error(`Redirected to access wall: ${finalUrl}`);
  }
  const html = await response.text();

  const { document } = parseHTML(html);
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article || !article.textContent) {
    throw new Error('Readability returned no content');
  }

  return {
    article_content: article.textContent.trim(),
    article_html: sanitiseHtml(article.content || ''),
    canonical_url: finalUrl,
  };
}

function redditPermalinkUrl(item) {
  // collector.js/sources/reddit.js stores the permalink as `item.url`
  // (format: https://www.reddit.com/r/<sub>/comments/<id>/<slug>/)
  if (!item || !item.url) return null;
  if (!isRedditUrl(item.url)) return null;
  // Strip query/hash and trailing slash, then append the Atom feed suffix.
  let base = item.url.split('#')[0].split('?')[0];
  if (base.endsWith('/')) base = base.slice(0, -1);
  return `${base}/.rss`;
}

async function parseRedditComments(xml) {
  const parser = new RSSParser({
    customFields: { item: [['id', 'id']] },
  });
  const feed = await parser.parseString(xml);
  const comments = [];
  let realReplyCount = 0;

  for (const entry of (feed.items || [])) {
    if ((entry.id || '').startsWith('t3_')) continue;
    const body = (entry.contentSnippet || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!body || body === '[deleted]' || body === '[removed]') continue;
    realReplyCount++;
    if (comments.length < TOP_COMMENTS) comments.push(body);
  }
  Object.defineProperty(comments, 'realReplyCount', { value: realReplyCount, enumerable: false });
  return comments;
}

async function extractRedditComments(item, log) {
  const url = redditPermalinkUrl(item);
  if (!url) throw new Error('No reddit permalink available');

  const response = await redditRequestQueue.fetch(url, {
    log,
    timeoutMs: FETCH_TIMEOUT_MS,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return parseRedditComments(await response.text());
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
        item.real_reply_count = top_comments.realReplyCount;
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

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) {
    return '';
  }
}

function redirectedToAccessWall(requestUrl, finalUrl) {
  try {
    const requested = new URL(requestUrl);
    const final = new URL(finalUrl);
    const destinationChanged = requested.hostname.toLowerCase() !== final.hostname.toLowerCase()
      || requested.pathname !== final.pathname;
    if (!destinationChanged) return false;

    const wallDestination = `${final.hostname}${final.pathname}`.toLowerCase();
    return /(?:^|[./_-])(?:no-?cookies?|cookie-?(?:notice|consent)|login|log-in|signin|sign-in|subscribe|subscription|paywall)(?:[./_-]|$)/.test(wallDestination);
  } catch (_) {
    return false;
  }
}

function makeSemaphore(limit) {
  let active = 0;
  const waiting = [];

  async function run(fn) {
    if (active >= limit) await new Promise(resolve => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = waiting.shift();
      if (next) next();
    }
  }

  return { run };
}

function isPaywalledUrl(url, paywalledHosts) {
  return paywalledHosts.has(hostnameOf(url));
}

function orderedCandidates(cluster, paywalledHosts) {
  return cluster.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) =>
      (Number(isPaywalledUrl(a.item.canonical_url || a.item.url, paywalledHosts))
        - Number(isPaywalledUrl(b.item.canonical_url || b.item.url, paywalledHosts)))
      || ((b.item.source_priority ?? 1) - (a.item.source_priority ?? 1))
      || (a.index - b.index)
    )
    .slice(0, 3)
    .map(candidate => candidate.item);
}

async function extractClusters(clusters, settings, log, emitProgress, { fetchImpl = globalThis.fetch } = {}) {
  const total = clusters.length;
  const stats = {
    attempted: 0,
    articles: 0,
    comments: 0,
    discussions: 0,
    failures: 0,
    gnews_resolved: 0,
    gnews_failed: 0,
    boilerplate_discarded: 0,
  };
  const googleSemaphore = makeSemaphore(2);
  const paywalledHosts = new Set(settings.getPaywalledHosts()
    .map(host => host.replace(/^www\./i, '').toLowerCase()));
  let cursor = 0;
  let completed = 0;

  if (emitProgress) emitProgress('extract', 0, total);

  async function processCluster(cluster) {
    stats.attempted++;
    cluster.article_text = null;
    cluster.article_html = null;
    cluster.article_url = null;
    cluster.top_comments = null;

    // A Reddit post page is a discussion, not an article: Readability finds
    // nothing on it, and every request waits a minute in the Reddit queue.
    // The post's own text is already in its description; comments are fetched
    // separately below.
    const fetchable = orderedCandidates(cluster, paywalledHosts)
      .filter(item => !isRedditUrl(item.canonical_url || item.url));
    if (cluster.items.length > 0
      && cluster.items.every(item => isRedditUrl(item.canonical_url || item.url))) {
      stats.discussions++;
    }

    const deferredPaywalledGoogleNews = [];
    for (const [index, item] of fetchable.entries()) {
      let url = item.canonical_url || item.url;
      if (!url) continue;

      if (isGoogleNewsUrl(url)) {
        const resolved = await googleSemaphore.run(() => resolveGoogleNewsUrl(url, { fetchImpl }));
        if (!resolved) {
          stats.gnews_failed++;
          continue;
        }
        stats.gnews_resolved++;
        url = resolved;
        const hasUntriedUnpaywalledCandidate = fetchable
          .slice(index + 1)
          .some(candidate => !isPaywalledUrl(candidate.canonical_url || candidate.url, paywalledHosts));
        if (isPaywalledUrl(url, paywalledHosts) && hasUntriedUnpaywalledCandidate) {
          deferredPaywalledGoogleNews.push({ item, url });
          continue;
        }
      }

      try {
        const article = await extractArticle(url, log, fetchImpl);
        if (article.article_content.length < 400) {
          throw new Error(`Article text too short (${article.article_content.length} characters)`);
        }
        cluster.article_text = article.article_content;
        cluster.article_html = article.article_html;
        cluster.article_url = article.canonical_url;
        item.article_content = article.article_content;
        item.article_html = article.article_html;
        item.article_url = article.canonical_url;
        stats.articles++;
        break;
      } catch (error) {
        log.warn('pipeline:extract', `Article fetch failed for ${url}: ${error.message}`);
      }
    }

    if (!cluster.article_text) {
      for (const deferred of deferredPaywalledGoogleNews) {
        const { item, url } = deferred;
        try {
          const article = await extractArticle(url, log, fetchImpl);
          if (article.article_content.length < 400) {
            throw new Error(`Article text too short (${article.article_content.length} characters)`);
          }
          cluster.article_text = article.article_content;
          cluster.article_html = article.article_html;
          cluster.article_url = article.canonical_url;
          item.article_content = article.article_content;
          item.article_html = article.article_html;
          item.article_url = article.canonical_url;
          stats.articles++;
          break;
        } catch (error) {
          log.warn('pipeline:extract', `Article fetch failed for ${url}: ${error.message}`);
        }
      }
    }

    const lead = cluster.lead;
    if (lead && lead.source_type === 'reddit' && redditPermalinkUrl(lead)) {
      try {
        const comments = await extractRedditComments(lead, log);
        if (comments.length > 0) {
          cluster.top_comments = comments;
          cluster.real_reply_count = comments.realReplyCount;
          stats.comments++;
        }
      } catch (error) {
        log.warn('pipeline:extract', `Reddit comments fetch failed for ${lead.url}: ${error.message}`);
      }
    }

    if (!cluster.article_text && fetchable.length > 0) stats.failures++;
  }

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= total) return;
      try {
        await processCluster(clusters[index]);
      } catch (error) {
        clusters[index].article_text = null;
        clusters[index].article_html = null;
        clusters[index].article_url = null;
        clusters[index].top_comments = null;
        stats.failures++;
        log.warn('pipeline:extract', `Unexpected error processing cluster: ${error.message}`);
      }
      completed++;
      if (emitProgress) emitProgress('extract', completed, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));

  const leadingTextGroups = new Map();
  for (const cluster of clusters) {
    if (!cluster.article_text) continue;
    const leadingText = cluster.article_text
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .slice(0, 300);
    const matches = leadingTextGroups.get(leadingText) || [];
    matches.push(cluster);
    leadingTextGroups.set(leadingText, matches);
  }

  for (const matches of leadingTextGroups.values()) {
    if (matches.length < 2) continue;
    const host = hostnameOf(matches[0].article_url) || 'unknown host';
    for (const cluster of matches) {
      cluster.article_text = null;
      cluster.article_html = null;
      cluster.article_url = null;
      for (const item of cluster.items) {
        delete item.article_content;
        delete item.article_html;
        delete item.article_url;
      }
    }
    stats.articles -= matches.length;
    stats.failures += matches.length;
    stats.boilerplate_discarded += matches.length;
    log.warn('pipeline:extract',
      `Discarded shared page text from ${host} for ${matches.length} stories`);
  }

  log.info('pipeline:extract',
    `Extracted ${total} stories: ${stats.articles} articles, ${stats.discussions} discussion posts, ${stats.comments} comment sets, ${stats.failures} failures, Google News ${stats.gnews_resolved} resolved / ${stats.gnews_failed} failed, ${stats.boilerplate_discarded} boilerplate discarded`);
  return { clusters, stats };
}

module.exports = {
  extract,
  extractClusters,
  isRedditUrl,
  redditPermalinkUrl,
  parseRedditComments,
  extractRedditComments,
};
