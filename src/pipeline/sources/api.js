'use strict';

function getNestedValue(obj, path) {
  if (!path || path === '') return obj;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function ensureISO(val) {
  if (!val) return null;
  // If already ISO string, return as-is
  if (typeof val === 'string') {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch { /* fall through */ }
  }
  // If unix timestamp (number)
  if (typeof val === 'number') {
    // Seconds vs milliseconds heuristic
    const ts = val < 1e12 ? val * 1000 : val;
    try {
      return new Date(ts).toISOString();
    } catch { /* fall through */ }
  }
  return null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJSON(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function fetchAPI(source, log) {
  const start = Date.now();

  try {
    const config = source.config || {};
    const mapping = config.mapping || {};
    const itemsPath = config.items_path != null ? config.items_path : '';
    const maxItems = config.max_items || 30;

    // Fetch initial list
    const listUrl = config.list_url || source.url;
    log.debug('api', `Fetching list from ${listUrl}`);
    const listData = await fetchJSON(listUrl);

    // Extract items array
    let rawItems = getNestedValue(listData, itemsPath);
    if (!Array.isArray(rawItems)) {
      throw new Error(`items_path "${itemsPath}" did not resolve to an array`);
    }

    // Limit items
    rawItems = rawItems.slice(0, maxItems);

    let items;

    // If detail_url is set, items are IDs that need individual fetching
    if (config.detail_url) {
      log.debug('api', `Fetching ${rawItems.length} detail pages`);
      items = [];
      // Batch in groups of 10 for concurrency control
      for (let i = 0; i < rawItems.length; i += 10) {
        const batch = rawItems.slice(i, i + 10);
        const results = await Promise.allSettled(
          batch.map(id => {
            const detailUrl = config.detail_url.replace('{id}', String(id));
            return fetchJSON(detailUrl);
          })
        );
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            items.push(result.value);
          }
        }
      }
    } else {
      items = rawItems;
    }

    // Map items to normalised shape
    const normalised = [];
    for (const item of items) {
      if (!item) continue;

      const title = (getNestedValue(item, mapping.title) || '').toString().trim();
      if (!title) continue;

      const rawUrl = getNestedValue(item, mapping.url) || '';
      const rawDescription = (getNestedValue(item, mapping.description) || '').toString().substring(0, 500);
      const rawImage = getNestedValue(item, mapping.image) || null;
      const rawPublished = getNestedValue(item, mapping.published) || null;
      const rawScore = getNestedValue(item, mapping.score);
      const rawComments = getNestedValue(item, mapping.comment_count);

      const entry = {
        title,
        url: rawUrl.toString(),
        external_url: mapping.external_url ? (getNestedValue(item, mapping.external_url) || null) : null,
        description: rawDescription,
        image: rawImage ? rawImage.toString() : null,
        published: ensureISO(rawPublished),
        score: rawScore != null ? Number(rawScore) : null,
        comment_count: rawComments != null ? Number(rawComments) : null,
        source_name: source.name,
        source_type: 'api',
        default_category: source.default_category,
      };

      log.debug('api', `Parsed item: ${title}`);
      normalised.push(entry);
    }

    const duration = Date.now() - start;
    log.info('api', `Fetched ${normalised.length} items from ${source.name}`, { duration_ms: duration });

    return { items: normalised, error: null };
  } catch (err) {
    const duration = Date.now() - start;
    log.error('api', `Failed to fetch ${source.name}: ${err.message}`, { duration_ms: duration });
    return { items: [], error: err.message };
  }
}

module.exports = { fetchAPI, getNestedValue, ensureISO };
