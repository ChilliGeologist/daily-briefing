'use strict';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
const BATCH_URL = 'https://news.google.com/_/DotsSplashUi/data/batchexecute';
const FETCH_TIMEOUT_MS = 10000;

async function fetchWithTimeout(fetchImpl, url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isGoogleNewsUrl(url) {
  if (!url) return false;
  try {
    return /(^|\.)news\.google\.com$/i.test(new URL(url).hostname);
  } catch (_) {
    return false;
  }
}

async function resolveGoogleNewsUrl(url, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const parsed = new URL(url);
    const id = parsed.pathname.split('/').filter(Boolean).pop();
    if (!id || !isGoogleNewsUrl(url)) return null;

    const articleUrl = `https://news.google.com/rss/articles/${encodeURIComponent(id)}`;
    const articleResponse = await fetchWithTimeout(fetchImpl, articleUrl, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    if (!articleResponse.ok) return null;

    const html = await articleResponse.text();
    const sg = html.match(/data-n-a-sg=["']([^"']+)["']/);
    const ts = html.match(/data-n-a-ts=["']([^"']+)["']/);
    if (!sg || !ts || !/^\d+$/.test(ts[1])) return null;

    const inner = '["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"'
      + id + '",' + ts[1] + ',"' + sg[1] + '"]';
    const request = JSON.stringify([[['Fbv4je', inner, null, 'generic']]]);
    const batchResponse = await fetchWithTimeout(fetchImpl, BATCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': USER_AGENT,
      },
      body: `f.req=${encodeURIComponent(request)}`,
    });
    if (!batchResponse.ok) return null;

    const body = await batchResponse.text();
    const match = body.match(/\\"garturlres\\",\\"(https?:[^\\"]+)\\"/);
    return match ? match[1] : null;
  } catch (_) {
    return null;
  }
}

module.exports = { isGoogleNewsUrl, resolveGoogleNewsUrl };
