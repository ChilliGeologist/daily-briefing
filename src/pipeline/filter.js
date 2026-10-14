'use strict';

function compilePatterns(patterns) {
  const compiled = [];

  for (const pattern of patterns) {
    const regexParts = typeof pattern === 'string'
      ? pattern.match(/^\/([\s\S]*)\/([a-z]*)$/i)
      : null;

    if (regexParts) {
      try {
        compiled.push({ pattern, regex: new RegExp(regexParts[1], regexParts[2]) });
      } catch (_) {
        // Invalid editable patterns are ignored.
      }
    } else if (typeof pattern === 'string') {
      compiled.push({ pattern, substring: pattern.toLowerCase() });
    }
  }

  return compiled;
}

function isHackerNewsItem(item) {
  return /^(?:hacker news|hn)\b/i.test(String(item.source_name || ''))
    || ['hackernews', 'hacker_news', 'hn'].includes(String(item.source_type || '').toLowerCase());
}

function matchingPattern(item, patterns) {
  const title = String(item.title || '');
  const lowerTitle = title.toLowerCase();

  for (const candidate of patterns) {
    if (candidate.pattern === '/\\bis hiring\\b/i' && !isHackerNewsItem(item)) continue;
    if (candidate.regex) {
      candidate.regex.lastIndex = 0;
      if (candidate.regex.test(title)) return candidate.pattern;
    } else if (lowerTitle.includes(candidate.substring)) {
      return candidate.pattern;
    }
  }

  return null;
}

function filterItems(items, { maxAgeHours, fillerPatterns, sourceMaxAge, now }) {
  const patterns = compilePatterns(fillerPatterns);
  const kept = [];
  const dropped = [];
  const stats = { total: items.length, kept: 0, stale: 0, filler: 0 };

  for (const item of items) {
    if (item.published) {
      const published = Date.parse(item.published);
      const hours = sourceMaxAge.get(item.source_name) ?? maxAgeHours;
      if (!Number.isNaN(published) && now - published > hours * 3600e3) {
        dropped.push({ item, reason: 'stale' });
        stats.stale++;
        continue;
      }
    }

    const filler = matchingPattern(item, patterns);
    if (filler !== null) {
      dropped.push({ item, reason: `filler: ${filler}` });
      stats.filler++;
      continue;
    }

    kept.push(item);
  }

  stats.kept = kept.length;
  return { kept, dropped, stats };
}

module.exports = { filterItems };
