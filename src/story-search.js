'use strict';

const { parseHTML } = require('linkedom');
const readingLogic = require('../public/reading-logic');

const STORY_SEARCH_SCHEMA = `
  CREATE VIRTUAL TABLE IF NOT EXISTS story_search USING fts5(
    title,
    kicker,
    summary,
    body,
    outlets,
    briefing_id UNINDEXED,
    story_key UNINDEXED,
    section UNINDEXED,
    date UNINDEXED,
    tokenize = 'porter unicode61 remove_diacritics 2'
  )
`;

function ensureStorySearch(sqlite) {
  sqlite.exec(STORY_SEARCH_SCHEMA);
}

function text(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function htmlText(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const spaced = value.replace(/<\/(?:p|div|li|h[1-6]|blockquote|figcaption)>/gi, '$& ');
    const { document } = parseHTML(`<html><body>${spaced}</body></html>`);
    return text(document.body && document.body.textContent);
  } catch (_) {
    return text(value.replace(/<[^>]*>/g, ' '));
  }
}

function sourceLabels(item) {
  const labels = [];
  const add = value => {
    const label = text(value);
    if (label && !labels.includes(label)) labels.push(label);
  };
  readingLogic.parseSources(item && item.sources).forEach(source => {
    if (typeof source === 'string') add(source);
    else {
      add(source.name);
      add(source.short_name);
      add(source.shortName);
    }
  });
  add(item && item.source);
  add(item && item.source_name);
  if (item && item.told && Array.isArray(item.told.outlets)) {
    item.told.outlets.forEach(outlet => {
      if (typeof outlet === 'string') add(outlet);
      else if (outlet) {
        add(outlet.name);
        add(outlet.short_name);
        add(outlet.shortName);
      }
    });
  }
  return labels.join(' ');
}

function storyBody(item) {
  const parts = [];
  const add = value => {
    const part = text(value);
    if (part) parts.push(part);
  };
  if (item && typeof item.article_html === 'string' && item.article_html.trim()) {
    add(htmlText(item.article_html));
  } else {
    add(item && item.detail);
  }
  add(item && item.description);
  if (item && Array.isArray(item.top_comments)) item.top_comments.forEach(add);
  return parts.join(' ');
}

function storyEntries(sections) {
  return readingLogic.storyEntries(sections);
}

function warning(logger, message) {
  if (logger && typeof logger.warn === 'function') logger.warn(message);
}

function parseBriefingData(row, logger) {
  if (row && row.data && typeof row.data === 'object') return row.data;
  try {
    const parsed = JSON.parse(row && row.data);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return parsed;
  } catch (_) {
    warning(logger, `Skipped briefing ${row && row.id}: invalid JSON`);
    return null;
  }
}

function indexBriefingRow(sqlite, row, logger = console) {
  const stats = { editionsIndexed: 0, storiesIndexed: 0, rowsSkipped: 0 };
  const data = parseBriefingData(row, logger);
  if (!data) {
    stats.rowsSkipped += 1;
    return stats;
  }

  const insert = sqlite.prepare(`
    INSERT INTO story_search
      (title, kicker, summary, body, outlets, briefing_id, story_key, section, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const entry of storyEntries(data.sections)) {
    try {
      const item = entry.item;
      insert.run(
        text(item.title),
        text(item.kicker),
        text(item.summary),
        storyBody(item),
        sourceLabels(item),
        row.id,
        entry.key,
        text(entry.section && (entry.section.title || entry.section.id)),
        text(row.date),
      );
      stats.storiesIndexed += 1;
    } catch (error) {
      stats.rowsSkipped += 1;
      warning(logger, `Skipped story in briefing ${row.id}: ${error.message}`);
    }
  }
  stats.editionsIndexed = 1;
  return stats;
}

function addStats(total, addition) {
  total.editionsIndexed += addition.editionsIndexed;
  total.storiesIndexed += addition.storiesIndexed;
  total.rowsSkipped += addition.rowsSkipped;
}

function backfillStorySearch(sqlite, logger = console) {
  ensureStorySearch(sqlite);
  const stats = { editionsIndexed: 0, storiesIndexed: 0, rowsSkipped: 0 };
  const rows = sqlite.prepare(`
    SELECT b.id, b.date, b.data
    FROM briefings b
    LEFT JOIN (SELECT DISTINCT briefing_id FROM story_search) search_index
      ON search_index.briefing_id = b.id
    WHERE search_index.briefing_id IS NULL
    ORDER BY b.id
  `).all();
  const run = sqlite.transaction(() => {
    for (const row of rows) addStats(stats, indexBriefingRow(sqlite, row, logger));
  });
  run();
  return stats;
}

function sanitiseSearchQuery(query) {
  const normalised = text(query).normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (!normalised) return '';
  return normalised.split(/\s+/).map(term => `"${term}"*`).join(' AND ');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeSnippet(value) {
  return escapeHtml(value)
    .replace(/\uE000/g, '<mark>')
    .replace(/\uE001/g, '</mark>');
}

function searchStories(sqlite, query, requestedLimit) {
  const displayQuery = text(query);
  const ftsQuery = sanitiseSearchQuery(displayQuery);
  if (!ftsQuery) return { query: displayQuery, total: 0, editions: [] };
  let limit = Number.parseInt(requestedLimit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 100;
  limit = Math.min(limit, 100);

  const rows = sqlite.prepare(`
    SELECT
      story_search.briefing_id,
      story_search.story_key,
      story_search.title,
      story_search.kicker,
      story_search.section,
      story_search.date,
      b.headline,
      snippet(story_search, 0, char(57344), char(57345), ' … ', 18) AS title_snippet,
      snippet(story_search, 1, char(57344), char(57345), ' … ', 18) AS kicker_snippet,
      snippet(story_search, 2, char(57344), char(57345), ' … ', 18) AS summary_snippet,
      snippet(story_search, 3, char(57344), char(57345), ' … ', 18) AS body_snippet,
      snippet(story_search, 4, char(57344), char(57345), ' … ', 18) AS outlets_snippet,
      bm25(story_search, 10, 4, 3, 1, 2) AS rank,
      b.created_at
    FROM story_search
    JOIN briefings b ON b.id = story_search.briefing_id
    WHERE story_search MATCH ?
    ORDER BY b.created_at DESC, b.id DESC, rank ASC, story_search.rowid ASC
    LIMIT ?
  `).all(ftsQuery, limit);

  const editions = [];
  const byId = new Map();
  for (const row of rows) {
    let edition = byId.get(String(row.briefing_id));
    if (!edition) {
      edition = {
        id: row.briefing_id,
        date: row.date,
        headline: row.headline || '',
        stories: [],
      };
      byId.set(String(row.briefing_id), edition);
      editions.push(edition);
    }
    const snippets = [row.title_snippet, row.kicker_snippet, row.summary_snippet, row.body_snippet, row.outlets_snippet];
    let bestSnippet = row.title;
    let bestScore = 0;
    for (const candidate of snippets) {
      const matches = String(candidate || '').match(/\uE000(.*?)\uE001/g) || [];
      const score = new Set(matches.map(match => match.toLocaleLowerCase())).size;
      if (score > bestScore) {
        bestSnippet = candidate;
        bestScore = score;
      }
    }
    edition.stories.push({
      key: row.story_key,
      title: row.title,
      kicker: row.kicker,
      section: row.section,
      snippet: safeSnippet(bestSnippet),
    });
  }
  return { query: displayQuery, total: rows.length, editions };
}

module.exports = {
  STORY_SEARCH_SCHEMA,
  backfillStorySearch,
  ensureStorySearch,
  indexBriefingRow,
  sanitiseSearchQuery,
  searchStories,
  storyEntries,
};
