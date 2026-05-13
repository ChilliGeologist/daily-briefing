'use strict';

const BATCH_SIZE = 10;

function buildPrompt(categories, batch) {
  const catList = categories.map(c => `- ${c.slug}: ${c.description || c.name}`).join('\n');

  const articleList = batch.map((item, i) => {
    const desc = (item.merged_descriptions && item.merged_descriptions.length > 0)
      ? item.merged_descriptions[0].substring(0, 200)
      : (item.description || '').substring(0, 200);
    return `${i + 1}. "${item.title}" - ${desc}`;
  }).join('\n');

  return `You are a news categoriser. Assign 1-2 categories to each article from the list below.

Available categories:
${catList}

For each article, respond with ONLY the article number and category slug(s), one per line.
If no category fits, respond with "none" and suggest a new category name.

Articles:
${articleList}

Format:
1: category-slug
2: slug1, slug2
3: none (suggested: Science & Space)`;
}

function toSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseResponse(responseText, batchSize, validSlugs, categoryNames) {
  const lines = responseText.trim().split('\n');
  const linePattern = /^(\d+):\s*(.+)$/;
  const suggestionPattern = /\(suggested?:\s*(.+?)\)/i;

  // Build lookup: slug -> slug, name-as-slug -> slug, lowercase-name -> slug
  const slugLookup = new Map();
  for (const slug of validSlugs) slugLookup.set(slug, slug);
  if (categoryNames) {
    for (const [slug, name] of categoryNames) {
      slugLookup.set(toSlug(name), slug);
      slugLookup.set(name.toLowerCase(), slug);
    }
  }

  function resolveSlug(raw) {
    const trimmed = raw.trim();
    if (validSlugs.has(trimmed)) return trimmed;
    return slugLookup.get(trimmed.toLowerCase()) || slugLookup.get(toSlug(trimmed)) || null;
  }

  const assignments = new Map();  // index -> slug[]
  const suggestions = [];

  for (const line of lines) {
    const match = line.trim().match(linePattern);
    if (!match) continue;

    const idx = parseInt(match[1], 10) - 1;  // 0-based
    if (idx < 0 || idx >= batchSize) continue;

    const content = match[2].trim();

    if (content.toLowerCase().startsWith('none')) {
      const sugMatch = content.match(suggestionPattern);
      if (sugMatch) {
        const suggestion = sugMatch[1].trim();
        // Only suggest if it doesn't match an existing category
        if (!resolveSlug(suggestion)) {
          suggestions.push(suggestion);
        }
      }
      assignments.set(idx, []);
    } else {
      const slugs = content.split(',').map(s => resolveSlug(s)).filter(Boolean);
      assignments.set(idx, slugs);
    }
  }

  return { assignments, suggestions };
}

async function categorise(items, db, ollama, settings, log, emitProgress, checkCancelled) {
  const categories = db.getCategories();
  const validSlugs = new Set(categories.map(c => c.slug));
  const categoryNames = new Map(categories.map(c => [c.slug, c.name]));
  const categorised = [];
  const uncategorised = [];
  const allSuggestions = [];
  const categoryCounts = {};

  // Process in batches
  var totalBatches = Math.ceil(items.length / BATCH_SIZE);
  if (emitProgress) emitProgress('categorise', 0, totalBatches);
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    if (checkCancelled) checkCancelled();
    const batch = items.slice(i, i + BATCH_SIZE);
    const prompt = buildPrompt(categories, batch);

    let assignments;
    let suggestions;

    try {
      const result = await ollama.generate(
        settings.getOllamaUrl(), settings.getOllamaModel(), prompt, { temperature: 0.1 }
      );

      log.debug('pipeline:categoriser', `Batch ${Math.floor(i / BATCH_SIZE) + 1} response`, {
        prompt_length: prompt.length,
        response: result.response.substring(0, 500),
        tokens: result.tokens,
        duration_ms: result.duration_ms,
      });

      const parsed = parseResponse(result.response, batch.length, validSlugs, categoryNames);
      assignments = parsed.assignments;
      suggestions = parsed.suggestions;
    } catch (err) {
      log.error('pipeline:categoriser', `Ollama error on batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
      // Fallback: assign default_category
      for (const item of batch) {
        const fallbackCat = item.default_category && validSlugs.has(item.default_category)
          ? [item.default_category]
          : ['other'];
        categorised.push({ ...item, categories: fallbackCat });
        for (const cat of fallbackCat) {
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        }
      }
      continue;
    }

    allSuggestions.push(...suggestions);

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const slugs = assignments.get(j);

      if (slugs && slugs.length > 0) {
        categorised.push({ ...item, categories: slugs });
        for (const cat of slugs) {
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        }
      } else {
        // No valid categories assigned — fall back to default_category or "other"
        const fallback = item.default_category && validSlugs.has(item.default_category)
          ? item.default_category
          : 'other';
        categorised.push({ ...item, categories: [fallback] });
        categoryCounts[fallback] = (categoryCounts[fallback] || 0) + 1;
      }
    }
    if (emitProgress) emitProgress('categorise', Math.floor(i / BATCH_SIZE) + 1, totalBatches);
  }

  // Deduplicate suggestions (case-insensitive)
  const seen = new Set();
  const uniqueSuggestions = [];
  for (const s of allSuggestions) {
    const key = s.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSuggestions.push(s);
    }
  }

  // Dismiss old suggestions before storing new ones from this run
  try {
    db.dismissAllSuggestions();
  } catch (err) {
    log.warn('pipeline:categoriser', `Failed to dismiss old suggestions: ${err.message}`);
  }

  for (const suggestion of uniqueSuggestions) {
    const count = allSuggestions.filter(s => s === suggestion).length;
    try {
      db.addSuggestion(null, suggestion, count);
    } catch (err) {
      log.warn('pipeline:categoriser', `Failed to store suggestion "${suggestion}": ${err.message}`);
    }
  }

  log.info('pipeline:categoriser', `Categorised ${categorised.length} items, ${uncategorised.length} uncategorised, ${uniqueSuggestions.length} new category suggestions`, categoryCounts);

  const stats = {
    categorised: categorised.length,
    uncategorised: uncategorised.length,
    suggestions: uniqueSuggestions.length,
    by_category: categoryCounts,
  };

  return { categorised, uncategorised, suggestions: uniqueSuggestions, stats };
}

module.exports = { categorise };
