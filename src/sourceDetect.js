'use strict';

const { parseHTML } = require('linkedom');
const RSSParser = require('rss-parser');

const FETCH_TIMEOUT_MS = 10000;
const UA = 'DailyBriefing/2.0 (+source-detect)';

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function isRedditHost(host) {
  return /(^|\.)reddit\.com$/i.test(host);
}

function extractSubreddit(pathname) {
  const m = pathname.match(/\/r\/([^/?#]+)/i);
  return m ? m[1] : null;
}

function looksLikeFeedXml(text) {
  const head = text.slice(0, 500).toLowerCase();
  return head.includes('<rss') || head.includes('<feed') || head.includes('<rdf:rdf');
}

async function parseFeedName(url, text) {
  try {
    const parser = new RSSParser();
    const feed = text ? await parser.parseString(text) : await parser.parseURL(url);
    if (feed && feed.title) return feed.title.trim();
  } catch { /* fall through */ }
  return null;
}

function findAutodiscoverFeed(html, baseUrl) {
  try {
    const { document } = parseHTML(html);
    const links = document.querySelectorAll('link[rel="alternate"]');
    for (const link of links) {
      const type = (link.getAttribute('type') || '').toLowerCase();
      const href = link.getAttribute('href');
      if (!href) continue;
      if (type.includes('rss') || type.includes('atom') || type.includes('xml')) {
        return new URL(href, baseUrl).toString();
      }
    }
  } catch { /* fall through */ }
  return null;
}

async function detectSource(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (isRedditHost(parsed.host)) {
    const sub = extractSubreddit(parsed.pathname);
    if (!sub) throw new Error('Reddit URL must point to a subreddit (e.g. reddit.com/r/news)');
    return { type: 'reddit', url: sub, name: `r/${sub}` };
  }

  const res = await fetchWithTimeout(parsed.toString());
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();
  const finalUrl = res.url || parsed.toString();

  const isXml = contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom');
  if (isXml || looksLikeFeedXml(text)) {
    const name = (await parseFeedName(finalUrl, text)) || parsed.host;
    return { type: 'rss', url: finalUrl, name };
  }

  if (contentType.includes('html')) {
    const feedUrl = findAutodiscoverFeed(text, finalUrl);
    if (feedUrl) {
      const feedRes = await fetchWithTimeout(feedUrl);
      if (feedRes.ok) {
        const feedText = await feedRes.text();
        const name = (await parseFeedName(feedUrl, feedText)) || parsed.host;
        return { type: 'rss', url: feedRes.url || feedUrl, name };
      }
    }
    throw new Error('Page has no RSS/Atom feed. Use manual entry.');
  }

  if (contentType.includes('json')) {
    throw new Error('JSON APIs need manual configuration (field paths). Use advanced entry.');
  }

  throw new Error(`Unrecognized content type: ${contentType || 'unknown'}`);
}

module.exports = { detectSource };
