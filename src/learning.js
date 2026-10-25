'use strict';

const readingLogic = require('../public/reading-logic');
const {
  SECTION_BY_INTEREST_KIND,
  SECTION_BY_INTEREST_LABEL,
  SECTION_BY_SOURCE_CATEGORY,
  SECTION_BY_SINGLE_SOURCE_CATEGORY,
  SECTIONS,
} = require('./pipeline/writer/sections');

const EVENT_KINDS = new Set(['seen', 'opened', 'read_full']);
const LOOKBACK_DAYS = 56;
const MIN_SEEN = 20;
const PSEUDO_SEEN = 10;
const NUDGE_K = 0.5;
const NUDGE_LIMIT = 0.15;
const MAX_EVENT_BATCH = 100;

function normaliseFeature(value) {
  return String(value || '').trim().toLocaleLowerCase('en-AU');
}

function sectionValue(section) {
  if (section && section.id) return normaliseFeature(section.id);
  return normaliseFeature(section && section.title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function sourceNames(item) {
  const names = [];
  for (const source of readingLogic.parseSources(item && item.sources)) {
    const name = typeof source === 'string' ? source : source && (source.name || source.short_name || source.shortName);
    const clean = String(name || '').trim();
    if (clean && !names.includes(clean)) names.push(clean);
  }
  const legacy = String(item && (item.source_name || item.source) || '').trim();
  if (legacy && !names.includes(legacy)) names.push(legacy);
  return names;
}

function interestLabels(item) {
  const labels = Array.isArray(item && item.interest_labels)
    ? item.interest_labels
    : (item && item.interest_matches || []).map(match => match && match.label);
  return [...new Set(labels.map(value => String(value || '').trim()).filter(Boolean))];
}

function eventError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function prepareStoryEvents(db, events, now = () => new Date()) {
  if (!Array.isArray(events) || events.length === 0) {
    throw eventError('events must be a non-empty array');
  }
  if (events.length > MAX_EVENT_BATCH) {
    throw eventError(`events must contain no more than ${MAX_EVENT_BATCH} items`);
  }

  const briefings = new Map();
  const storyMaps = new Map();
  return events.map((event, index) => {
    const number = index + 1;
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw eventError(`Event ${number} must be an object`);
    }
    if (!Number.isInteger(event.briefing_id) || event.briefing_id < 1) {
      throw eventError(`Event ${number} has an invalid briefing id`);
    }
    if (typeof event.story_key !== 'string' || !event.story_key.trim() || event.story_key.length > 200) {
      throw eventError(`Event ${number} has an invalid story key`);
    }
    if (!EVENT_KINDS.has(event.kind)) {
      throw eventError(`Event ${number} has an invalid kind`);
    }

    if (!briefings.has(event.briefing_id)) {
      const briefing = db.getBriefingById(event.briefing_id);
      briefings.set(event.briefing_id, briefing);
      storyMaps.set(event.briefing_id, new Map(
        briefing ? readingLogic.storyEntries(briefing.data && briefing.data.sections).map(entry => [entry.key, entry]) : []
      ));
    }
    const entry = storyMaps.get(event.briefing_id).get(event.story_key);
    if (!entry) throw eventError(`Event ${number} does not match a story in that edition`);
    const item = entry.item;
    return {
      briefing_id: event.briefing_id,
      story_key: event.story_key,
      kind: event.kind,
      at: now().toISOString(),
      section: sectionValue(entry.section),
      kicker: normaliseFeature(item.kicker),
      outlets: JSON.stringify(sourceNames(item)),
      interest_labels: JSON.stringify(interestLabels(item)),
    };
  });
}

function recordStoryEvents(db, events, options = {}) {
  const rows = prepareStoryEvents(db, events, options.now);
  return { accepted: rows.length, recorded: db.insertStoryEvents(rows) };
}

function eventOpenWeight(row) {
  return (Number(row && row.opened) ? 1 : 0) + (Number(row && row.read_full) ? 0.5 : 0);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function calculateNudge(seen, weightedOpens, overallRate) {
  if (seen < MIN_SEEN) return null;
  const openRate = weightedOpens / seen;
  const shrunkRate = (weightedOpens + (PSEUDO_SEEN * overallRate)) / (seen + PSEUDO_SEEN);
  const rawNudge = overallRate > 0
    ? ((shrunkRate - overallRate) / overallRate) * NUDGE_K
    : 0;
  return {
    seen_count: seen,
    weighted_opens: weightedOpens,
    open_rate: openRate,
    shrunk_rate: shrunkRate,
    nudge: clamp(rawNudge, -NUDGE_LIMIT, NUDGE_LIMIT),
  };
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function displaySection(value) {
  const section = SECTIONS.find(candidate => candidate.id === value);
  return section ? section.title : value;
}

function addFeature(groups, type, value, displayValue, row, weight) {
  const normalised = normaliseFeature(value);
  if (!normalised) return;
  const key = `${type}\u0000${normalised}`;
  if (!groups.has(key)) {
    groups.set(key, {
      feature_type: type,
      feature_value: normalised,
      display_value: String(displayValue || value).trim(),
      seen: 0,
      weighted_opens: 0,
    });
  }
  const group = groups.get(key);
  group.seen += 1;
  group.weighted_opens += weight;
}

function computeNudges(stories, computedAt) {
  const seenStories = (stories || []).filter(row => Number(row.seen));
  const overallWeightedOpens = seenStories.reduce((total, row) => total + eventOpenWeight(row), 0);
  const overallRate = seenStories.length ? overallWeightedOpens / seenStories.length : 0;
  const groups = new Map();

  for (const row of seenStories) {
    const weight = eventOpenWeight(row);
    addFeature(groups, 'kicker', row.kicker, row.kicker, row, weight);
    addFeature(groups, 'section', row.section, displaySection(row.section), row, weight);
    const outlets = [...new Set(parseArray(row.outlets).map(value => String(value || '').trim()).filter(Boolean))];
    for (const outlet of outlets) addFeature(groups, 'outlet', outlet, outlet, row, weight);
  }

  const nudges = [];
  for (const group of groups.values()) {
    const result = calculateNudge(group.seen, group.weighted_opens, overallRate);
    if (!result) continue;
    nudges.push({
      feature_type: group.feature_type,
      feature_value: group.feature_value,
      display_value: group.display_value,
      nudge: result.nudge,
      seen_count: result.seen_count,
      weighted_opens: result.weighted_opens,
      open_rate: result.open_rate,
      shrunk_rate: result.shrunk_rate,
      overall_rate: overallRate,
      computed_at: computedAt,
    });
  }
  nudges.sort((left, right) => Math.abs(right.nudge) - Math.abs(left.nudge)
    || left.feature_type.localeCompare(right.feature_type)
    || left.feature_value.localeCompare(right.feature_value));
  return {
    nudges,
    seen_count: seenStories.length,
    weighted_opens: overallWeightedOpens,
    overall_rate: overallRate,
  };
}

function recomputeLearning(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const computedAt = now.toISOString();
  const since = new Date(now.getTime() - (LOOKBACK_DAYS * 24 * 60 * 60 * 1000)).toISOString();
  const result = computeNudges(db.getLearningStories(since), computedAt);
  db.replaceLearnedNudges(result.nudges);
  db.setSetting('learning_last_computed_at', computedAt);
  return result;
}

function nudgeLookup(rows) {
  const lookup = new Map();
  for (const row of rows || []) {
    const value = normaliseFeature(row.feature_value);
    const nudge = Number(row.nudge);
    if (value && Number.isFinite(nudge)) lookup.set(`${row.feature_type}\u0000${value}`, nudge);
  }
  return lookup;
}

function lookupNudge(lookup, type, value) {
  return lookup.get(`${type}\u0000${normaliseFeature(value)}`);
}

function guessedSection(cluster) {
  const matches = cluster.interest_matches || [];
  for (const match of matches) {
    if (SECTION_BY_INTEREST_LABEL[match.label]) return SECTION_BY_INTEREST_LABEL[match.label];
    if (SECTION_BY_INTEREST_KIND[match.kind]) return SECTION_BY_INTEREST_KIND[match.kind];
  }
  const categories = [cluster.lead, ...(cluster.items || [])]
    .map(item => item && item.default_category)
    .filter(Boolean);
  for (const category of categories) {
    if (SECTION_BY_SOURCE_CATEGORY[category]) return SECTION_BY_SOURCE_CATEGORY[category];
    if (SECTION_BY_SINGLE_SOURCE_CATEGORY[category]) return SECTION_BY_SINGLE_SOURCE_CATEGORY[category];
    if (category === 'local' || category === 'tasmania') return 'tasmania';
    if (category === 'world') return 'world';
    if (category === 'tech') return 'tech';
    if (category === 'australia' || category === 'top-stories') return 'australia';
  }
  return 'australia';
}

function clusterOutlets(cluster) {
  const names = [];
  const add = value => {
    const clean = String(value || '').trim();
    if (clean && !names.includes(clean)) names.push(clean);
  };
  for (const item of cluster.items || []) add(item && item.source_name);
  for (const source of cluster.sources || []) add(typeof source === 'string' ? source : source && source.name);
  add(cluster.source_name);
  return names;
}

function learningNudge(cluster, rows, options = {}) {
  const lookup = rows instanceof Map ? rows : nudgeLookup(rows);
  const features = [];
  if (options.includeKicker !== false) {
    const kicker = cluster.kicker;
    const value = lookupNudge(lookup, 'kicker', kicker);
    if (value !== undefined) features.push({ feature_type: 'kicker', feature_value: normaliseFeature(kicker), nudge: value });
  }
  const outletValues = clusterOutlets(cluster)
    .map(outlet => ({ outlet, nudge: lookupNudge(lookup, 'outlet', outlet) }))
    .filter(entry => entry.nudge !== undefined)
    .sort((left, right) => right.nudge - left.nudge);
  if (outletValues.length) {
    features.push({
      feature_type: 'outlet',
      feature_value: normaliseFeature(outletValues[0].outlet),
      nudge: outletValues[0].nudge,
    });
  }
  const section = options.section || cluster.section || guessedSection(cluster);
  const sectionNudge = lookupNudge(lookup, 'section', section);
  if (sectionNudge !== undefined) {
    features.push({ feature_type: 'section', feature_value: normaliseFeature(section), nudge: sectionNudge });
  }
  const product = features.reduce((factor, feature) => factor * (1 + feature.nudge), 1);
  const nudge = clamp(Number((product - 1).toFixed(12)), -NUDGE_LIMIT, NUDGE_LIMIT);
  return { nudge, factor: 1 + nudge, features };
}

function learningStatus(db) {
  return {
    nudges: db.getLearnedNudges(),
    last_computed_at: db.getSetting('learning_last_computed_at'),
  };
}

module.exports = {
  EVENT_KINDS,
  LOOKBACK_DAYS,
  MAX_EVENT_BATCH,
  MIN_SEEN,
  NUDGE_K,
  NUDGE_LIMIT,
  PSEUDO_SEEN,
  calculateNudge,
  computeNudges,
  eventOpenWeight,
  guessedSection,
  learningNudge,
  learningStatus,
  nudgeLookup,
  prepareStoryEvents,
  recordStoryEvents,
  recomputeLearning,
};
