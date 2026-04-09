'use strict';

function diceSimilarity(a, b) {
  const bigrams = (s) => {
    const clean = s.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    const words = clean.split(/\s+/).filter(Boolean);
    const bg = new Set();
    for (const w of words) {
      for (let i = 0; i < w.length - 1; i++) bg.add(w.substring(i, i + 2));
    }
    return bg;
  };
  const aSet = bigrams(a);
  const bSet = bigrams(b);
  if (aSet.size === 0 && bSet.size === 0) return 0;
  const intersection = [...aSet].filter(x => bSet.has(x)).length;
  return (2 * intersection) / (aSet.size + bSet.size);
}

// Union-Find data structure
function makeUnionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);

  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(x, y) {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return;
    if (rank[rx] < rank[ry]) { parent[rx] = ry; }
    else if (rank[rx] > rank[ry]) { parent[ry] = rx; }
    else { parent[ry] = rx; rank[rx]++; }
  }

  return { find, union };
}

async function confirmCluster(cluster, ollamaClient, settings, log) {
  if (!ollamaClient) return true;  // auto-confirm when no Ollama

  const itemList = cluster.map((item, i) =>
    `${i + 1}. "${item.title}" (${item.source_name}): ${(item.description || '').substring(0, 200)}`
  ).join('\n');

  const prompt = `Are these articles about the same event or story? Reply with ONLY "YES" or "NO" followed by a one-sentence explanation.\n\n${itemList}`;

  try {
    const result = await ollamaClient.generate(
      settings.getOllamaUrl(), settings.getOllamaModel(), prompt, { temperature: 0.1 }
    );
    const answer = result.response.trim().toUpperCase();
    const confirmed = answer.startsWith('YES');

    log.debug('pipeline:dedup', `Merge check: ${confirmed ? 'CONFIRMED' : 'DENIED'}`, {
      titles: cluster.map(i => i.title),
      response: result.response.substring(0, 200),
      tokens: result.tokens,
      duration_ms: result.duration_ms
    });

    return confirmed;
  } catch (err) {
    log.warn('pipeline:dedup', `LLM merge check failed, auto-confirming: ${err.message}`);
    return true;  // fail open — still merge on LLM error
  }
}

function mergeCluster(cluster) {
  // Sort by score descending to pick best item
  const sorted = [...cluster].sort((a, b) => b.relevance_score - a.relevance_score);
  const best = sorted[0];

  const sources = sorted.map(item => ({ name: item.source_name, url: item.url }));
  const merged_descriptions = sorted.map(item => item.description).filter(Boolean);
  const image = sorted.map(item => item.image).find(img => img != null) || null;
  const published = sorted
    .map(item => item.published)
    .filter(Boolean)
    .sort()
    .pop() || best.published;

  return {
    ...best,
    sources,
    merged_descriptions,
    image,
    published,
    relevance_score: best.relevance_score,
  };
}

async function dedup(items, ollamaClient, settings, log) {
  const total = items.length;

  if (total === 0) {
    log.info('dedup', 'Dedup: 0 candidate clusters from 0 items, 0 confirmed merges, 0 items after dedup');
    return { items: [], stats: { total: 0, candidates: 0, confirmed: 0, final: 0 } };
  }

  // Pass 1: Dice similarity clustering via union-find
  const uf = makeUnionFind(total);

  for (let i = 0; i < total; i++) {
    for (let j = i + 1; j < total; j++) {
      if (diceSimilarity(items[i].title, items[j].title) > 0.6) {
        uf.union(i, j);
      }
    }
  }

  // Group items by cluster root
  const clusters = new Map();
  for (let i = 0; i < total; i++) {
    const root = uf.find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(items[i]);
  }

  // Pass 2: LLM confirmation for multi-item clusters
  let candidates = 0;
  let confirmed = 0;
  const result = [];

  for (const cluster of clusters.values()) {
    if (cluster.length === 1) {
      // Single item: wrap in merged format
      const item = cluster[0];
      result.push({
        ...item,
        sources: [{ name: item.source_name, url: item.url }],
        merged_descriptions: [item.description].filter(Boolean),
      });
      continue;
    }

    candidates++;

    const shouldMerge = ollamaClient
      ? await confirmCluster(cluster, ollamaClient, settings, log)
      : true;

    if (shouldMerge) {
      confirmed++;
      result.push(mergeCluster(cluster));
    } else {
      // Not confirmed: treat each item individually
      for (const item of cluster) {
        result.push({
          ...item,
          sources: [{ name: item.source_name, url: item.url }],
          merged_descriptions: [item.description].filter(Boolean),
        });
      }
    }
  }

  const stats = { total, candidates, confirmed, final: result.length };

  log.info('dedup', `Dedup: ${candidates} candidate clusters from ${total} items, ${confirmed} confirmed merges, ${result.length} items after dedup`);

  return { items: result, stats };
}

module.exports = { dedup, diceSimilarity, confirmCluster };
