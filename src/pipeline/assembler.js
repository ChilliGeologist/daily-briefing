'use strict';

const { SECTIONS, TOP_SECTION } = require('./writer/sections');
const { communityReplies, isCommunityItem } = require('./writer/prompts');

const COMMUNITY_POST_CHARS = 6000;
const COMMUNITY_REPLY_COUNT = 5;
const COMMUNITY_REPLY_CHARS = 1000;

function valuesOf(storiesById) {
  return storiesById instanceof Map ? [...storiesById.values()] : Object.values(storiesById || {});
}

function getStory(storiesById, id) {
  return storiesById instanceof Map ? storiesById.get(id) : storiesById && storiesById[id];
}

function readingTime(detail) {
  const words = String(detail || '').trim().match(/\S+/g) || [];
  return Math.max(1, Math.ceil(words.length / 200));
}

function readerStory(story, significance) {
  const output = {
    id: story.id,
    title: story.headline,
    kicker: story.kicker,
    summary: story.summary,
    detail: story.detail,
    significance,
    image: story.image || null,
    sources: story.sources || [],
    canonical_url: story.canonical_url || null,
    article_url: story.article_url || null,
    article_html: story.article_html || null,
    coverage: Number(story.coverage) || 1,
    interest_labels: (story.interest_matches || []).map(match => match.label).filter(Boolean),
    written_by: story.written_by,
    reading_time: readingTime(story.detail),
  };
  if (isCommunityItem(story)) {
    output.description = String(story.description || '').trim().slice(0, COMMUNITY_POST_CHARS);
    output.top_comments = communityReplies(story, COMMUNITY_REPLY_COUNT, COMMUNITY_REPLY_CHARS);
  }
  return output;
}

function storiesForIds(ids, storiesById, significance, excluded = new Set()) {
  const output = [];
  const seen = new Set();
  for (const id of ids || []) {
    if (seen.has(id) || excluded.has(id)) continue;
    seen.add(id);
    const story = getStory(storiesById, id);
    if (story) output.push(readerStory(story, significance));
  }
  return output;
}

function assemble(edit, storiesById, meta = {}) {
  const topIds = (edit.top || []).filter(id => Boolean(getStory(storiesById, id)));
  const topSet = new Set(topIds);
  const sections = [];
  const topItems = storiesForIds(topIds, storiesById, 'high');
  if (topItems.length > 0) {
    sections.push({ ...TOP_SECTION, icon: 'globe', items: topItems, more: [] });
  }

  for (const section of SECTIONS) {
    const items = storiesForIds((edit.sections || {})[section.id], storiesById, 'medium', topSet);
    const itemIds = new Set(items.map(item => item.id));
    const more = storiesForIds(
      (edit.more || {})[section.id],
      storiesById,
      'medium',
      new Set([...topSet, ...itemIds])
    );
    if (items.length === 0 && more.length === 0) continue;
    sections.push({ ...section, icon: 'globe', items, more });
  }

  const allStories = valuesOf(storiesById);
  const firstTop = topIds.length > 0 ? getStory(storiesById, topIds[0]) : null;
  const headline = (firstTop && firstTop.headline)
    || (allStories[0] && allStories[0].headline)
    || 'The Daily Gump';
  const totalItems = sections.reduce((total, section) => total + section.items.length + section.more.length, 0);
  if (meta.log && meta.log.info) {
    meta.log.info('assembler', `Assembled briefing: ${sections.length} sections, ${totalItems} items total`);
  }

  return {
    headline,
    writer: meta.writer,
    stats: meta.stats,
    sections,
  };
}

module.exports = { assemble };
