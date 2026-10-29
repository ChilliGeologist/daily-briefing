'use strict';

const { SECTIONS, TOP_SECTION } = require('./writer/sections');
const { communityReplies, isCommunityItem } = require('./writer/prompts');
const { learningNudge, nudgeLookup } = require('../learning');

const COMMUNITY_POST_CHARS = 6000;
const COMMUNITY_REPLY_COUNT = 5;
const COMMUNITY_REPLY_CHARS = 1000;

function valuesOf(storiesById) {
  return storiesById instanceof Map ? [...storiesById.values()] : Object.values(storiesById || {});
}

function getStory(storiesById, id) {
  return storiesById instanceof Map ? storiesById.get(id) : storiesById && storiesById[id];
}

function readingTime(summary) {
  const words = String(summary || '').trim().match(/\S+/g) || [];
  return Math.max(1, Math.ceil(words.length / 200));
}

function readerStory(story, significance) {
  const output = {
    id: story.id,
    title: story.headline,
    kicker: story.kicker,
    summary: story.summary,
    significance,
    image: story.image || null,
    ...(Array.isArray(story.images) && story.images.length > 0 ? { images: story.images } : {}),
    ...(story.image_described ? { image_described: true } : {}),
    ...(story.told ? { told: story.told } : {}),
    sources: story.sources || [],
    canonical_url: story.canonical_url || null,
    article_url: story.article_url || null,
    article_html: story.article_html || null,
    coverage: Number(story.coverage) || 1,
    interest_labels: (story.interest_matches || []).map(match => match.label).filter(Boolean),
    written_by: story.written_by,
    reading_time: readingTime(story.summary),
    ...(story.brief ? { brief: true } : {}),
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

function orderSectionIds(ids, storiesById, sectionId, learnedLookup, applied) {
  const entries = (ids || []).map((id, index) => {
    const story = getStory(storiesById, id);
    const learned = story
      ? learningNudge(story, learnedLookup, { section: sectionId })
      : { nudge: 0, factor: 1, features: [] };
    const baseScore = Number(story && (story.base_relevance_score ?? story.relevance_score));
    return {
      id,
      index,
      story,
      learned,
      score: (Number.isFinite(baseScore) ? baseScore : 0) * learned.factor,
    };
  });
  if (!entries.some(entry => entry.learned.nudge !== 0)) return entries.map(entry => entry.id);
  entries.sort((left, right) => (right.score - left.score) || (left.index - right.index));
  for (const entry of entries) {
    if (!entry.story || entry.learned.nudge === 0) continue;
    applied.push({
      id: entry.story.id,
      title: entry.story.headline || entry.story.title,
      section: sectionId,
      nudge: entry.learned.nudge,
      features: entry.learned.features,
    });
  }
  return entries.map(entry => entry.id);
}

function assemble(edit, storiesById, meta = {}) {
  const topIds = (edit.top || []).filter(id => Boolean(getStory(storiesById, id)));
  const topSet = new Set(topIds);
  const sections = [];
  const learnedLookup = nudgeLookup(meta.learningEnabled === false ? [] : (meta.learnedNudges || []));
  const appliedNudges = [];
  const topItems = storiesForIds(topIds, storiesById, 'high');
  if (topItems.length > 0) {
    sections.push({ ...TOP_SECTION, icon: 'globe', items: topItems, more: [] });
  }

  const sectionById = new Map(SECTIONS.map(section => [section.id, section]));
  const configuredSections = Array.isArray(meta.sections)
    ? meta.sections.map(entry => ({ ...sectionById.get(entry.id), hidden: Boolean(entry.hidden) }))
      .filter(section => section.id)
    : SECTIONS;
  for (const section of configuredSections) {
    if (section.hidden) continue;
    const sectionItemIds = (edit.sections || {})[section.id] || [];
    const moreIds = (edit.more || {})[section.id] || [];
    const briefIds = (edit.briefs || {})[section.id] || [];
    const ordered = orderSectionIds(
      [...sectionItemIds, ...moreIds].filter(id => !topSet.has(id)),
      storiesById,
      section.id,
      learnedLookup,
      appliedNudges
    );
    const orderedItemIds = ordered.slice(0, sectionItemIds.length);
    const orderedMoreIds = ordered.slice(sectionItemIds.length);
    const items = storiesForIds(orderedItemIds, storiesById, 'medium', topSet);
    const itemIds = new Set(items.map(item => item.id));
    const more = storiesForIds(
      orderedMoreIds,
      storiesById,
      'medium',
      new Set([...topSet, ...itemIds])
    );
    const briefs = storiesForIds(
      briefIds,
      storiesById,
      'medium',
      new Set([...topSet, ...itemIds, ...more.map(item => item.id)])
    ).slice(0, 3);
    if (items.length === 0 && more.length === 0 && briefs.length === 0) continue;
    sections.push({
      ...section,
      icon: 'globe',
      items,
      more,
      ...(briefs.length > 0 ? { briefs } : {}),
    });
  }

  const allStories = valuesOf(storiesById);
  const firstTop = topIds.length > 0 ? getStory(storiesById, topIds[0]) : null;
  const headline = (firstTop && firstTop.headline)
    || (allStories[0] && allStories[0].headline)
    || 'The Daily Gump';
  const totalItems = sections.reduce((total, section) =>
    total + section.items.length + section.more.length + (section.briefs || []).length, 0);
  if (meta.log && meta.log.info) {
    meta.log.info('assembler', `Assembled briefing: ${sections.length} sections, ${totalItems} items total`);
    if (appliedNudges.length > 0) {
      const largest = appliedNudges
        .sort((left, right) => Math.abs(right.nudge) - Math.abs(left.nudge))
        .slice(0, 10);
      meta.log.info('pipeline:learning', `Applied learned nudges to ${appliedNudges.length} section stories`, {
        top: largest,
      });
    }
  }

  return {
    headline,
    writer: meta.writer,
    stats: meta.stats,
    sections,
  };
}

module.exports = { assemble, orderSectionIds };
