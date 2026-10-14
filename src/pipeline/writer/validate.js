'use strict';

const { DEFAULT_INTERESTS, interestScore, matchInterests } = require('./interests');
const { guardFacts } = require('./facts');
const { communityReplies, isCommunityItem } = require('./prompts');
const {
  hasAustralianOnlyPlace,
  hasOverseasOnlyEvidence,
  isBarePlaceName,
} = require('./australian-places');
const { isTasmanianSource, matchTasmanianPlaces } = require('./tasmanian-places');
const {
  SECTIONS,
  SECTION_BY_INTEREST_KIND,
  SECTION_BY_INTEREST_LABEL,
  SECTION_BY_SOURCE_CATEGORY,
  SECTION_BY_SINGLE_SOURCE_CATEGORY,
  SECTION_REQUIRES_PLACE,
  isSectionId,
} = require('./sections');

const SECTION_IDS = SECTIONS.map(section => section.id);
const TOP_TECH_SECTIONS = new Set(['tech', 'homelab', 'gaming', 'internet']);
const TOP_NEWS_SECTIONS = new Set(['tasmania', 'australia', 'world']);
// Only phrasing about the supplied text itself. Ordinary reporting such as
// "police released no details about the man" must not match.
const MISSING_TEXT = /\b(?:no\s+(?:further\s+|additional\s+|other\s+)?(?:(?:article|story|source|supplied|available)\s+)?(?:text|content|details?|information|viewpoints?)(?:\s+or\s+[\p{L}\s]+?)?\s+(?:was|were|is|are|has\s+been|have\s+been)\s+(?:provided|available|included|supplied|given)|no\s+(?:article|story|source|supplied)\s+(?:text|content)|(?:article|story|source|supplied|available)\s+(?:text|content)\s+(?:was|were|is|are)\s+(?:not\s+(?:provided|available|included|supplied|given)|missing|absent)|in\s+the\s+(?:available|supplied|provided)\s+text|(?:unable|impossible)\s+to\s+(?:write|provide|summari[sz]e)|summary\s+(?:is\s+|was\s+)?impossible|no\s+summary\s+can\s+be)\b/iu;
// The writer describing the page instead of the story: "The provided text is
// not a genuine news story and appears to be a paywall or subscription
// prompt" (404 Media, 2026-10-15).
const PAGE_NOT_STORY = /\b(?:(?:the\s+)?(?:provided|supplied|available)\s+(?:text|page|content)\s+(?:is|was)\s+not\b|not\s+a\s+genuine\s+(?:news\s+)?(?:story|article)|appears\s+to\s+be\s+(?:a|an)\s+(?:paywall|subscription|sign-?up|login|log-in|cookie)\b)/i;
const META_KICKER = /^(?:headline mystery|no story|subscription wall|paywall|login page|cookie notice)$/i;
const HEADLINE_LABEL = /^\s*(?:(?:listen|watch|live|revealed|exclusive|video|photos):\s*)+/i;

function parseObject(raw) {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}

function defaultSection(item) {
  for (const match of (item.interest_matches || [])) {
    const byLabel = SECTION_BY_INTEREST_LABEL[match.label];
    if (byLabel) return byLabel;
    const byKind = SECTION_BY_INTEREST_KIND[match.kind];
    if (byKind) return byKind;
  }
  return 'australia';
}

function firstSentence(teaser) {
  const text = String(teaser || '').trim();
  const match = text.match(/^.*?[.!?](?=\s|$)/s);
  return (match ? match[0] : text).slice(0, 200).trim();
}

function missingTextFields(value) {
  return ['summary', 'detail', 'kicker'].filter(field => {
    const text = String(value?.[field] || '').trim();
    return MISSING_TEXT.test(text) || PAGE_NOT_STORY.test(text)
      || (field === 'kicker' && META_KICKER.test(text));
  });
}

function hasHighCommunityEngagement(item) {
  return (Number(item.score) || 0) >= 250 || (Number(item.comment_count) || 0) >= 75;
}

function isCommunityHelpRequest(item) {
  if (!isCommunityItem(item) || hasHighCommunityEngagement(item)) return false;
  const title = String(item.title || '').trim();
  const description = String(item.description || '').trim();
  if (/^help me\b/i.test(title) || /\bhow do i\b/i.test(title)) return true;
  if (/\b(?:what should i|should i)\b/i.test(title)) return true;
  if (/\bquestions?\s*\??$/i.test(title)) return true;
  if (/\bfor (?:a )?beginner\b/i.test(title)) return true;
  if (/\bwhich\b.+\bfor\b/i.test(title)) return true;
  if (/\b\S+\s+or\s+.+\s+for\s+(?:a\s+)?(?:server|nas|homelab)\b/i.test(title)) return true;
  if (/\b(?:advice|recommendations?)\b/i.test(title) || /^(?:please\s+)?recommend\b/i.test(title)) return true;
  if (/\b(?:suggestions?|help|ideas?|input|feedback)\s+(?:sought|needed|wanted|requested|please)\b/i.test(title)) return true;
  if (/^looking for\b/i.test(title) || /\bideas?\s*\??$/i.test(title)) return true;
  if (/^is\b.+\bgood enough for\b/i.test(title) || /^moving to\b.+\bor\b/i.test(title)) return true;
  // A short, plain title whose post asks for help ("My Home Firewall": "Please
  // suggest your valuable suggestions"); the writer's retry would otherwise
  // dress it up as a headline.
  return words(title).length <= 6
    && /\b(?:just bought|good purchase|any advice|any suggestions?|please suggest|please help|need(?:s)? help|(?:can|could|would)\s+(?:someone|anyone|somebody)\s+(?:please\s+)?(?:help|explain|tell|suggest)|any ideas|what am i doing wrong)\b/i.test(description);
}

function isUnansweredCommunityQuestion(item) {
  if (!isCommunityItem(item) || !/[?？]/u.test(String(item.title || ''))) return false;
  return communityReplies(item).length < 2;
}

function fallbackWrite(item) {
  const teaser = String(item.description || item.merged_descriptions?.[0] || '').trim();
  const interestLabel = (item.interest_matches || []).map(match => match.label).find(Boolean);
  const outlet = item.source_name || (item.sources || []).map(source => source.name).find(Boolean) || 'News';
  return {
    is_news: true,
    headline: stripHeadlineFullStop(String(item.title || '').trim()),
    summary: firstSentence(teaser),
    detail: teaser,
    kicker: interestLabel || outlet,
    section: defaultSection(item),
  };
}

function sectionEvidence(item, value) {
  return [
    item.title,
    value.headline,
    item.description,
    ...(Array.isArray(item.merged_descriptions) ? item.merged_descriptions : []),
    item.article_content,
  ].filter(text => typeof text === 'string' && text.trim()).join('\n');
}

function enforceSectionRequirements(value, item, interests, problems) {
  const sourceSection = SECTION_BY_SOURCE_CATEGORY[item.default_category]
    || ((Number(item.coverage) || 1) <= 1 ? SECTION_BY_SINGLE_SOURCE_CATEGORY[item.default_category] : undefined);
  if (sourceSection && TOP_NEWS_SECTIONS.has(value.section)) {
    problems.push(`section moved: ${value.section} -> ${sourceSection} (${item.default_category} source)`);
    value.section = sourceSection;
    return true;
  }
  if (value.section === 'world' && hasAustralianOnlyPlace(
    value.headline,
    value.summary,
    value.detail,
    value.kicker
  )) {
    // Probe the existing Tasmania rule with exactly its existing evidence and
    // configured interests; do not broaden its gazetteer or source exceptions.
    const local = { ...value, section: 'tasmania' };
    enforceSectionRequirements(local, item, interests, []);
    value.section = local.section;
    problems.push(`section moved: world -> ${value.section} (Australian place named; no overseas place named)`);
    return true;
  }
  if (value.section === 'australia' && hasOverseasOnlyEvidence(
    value.headline,
    value.summary,
    value.detail,
    value.kicker,
    item.title,
    item.description,
    item.article_content
  )) {
    value.section = 'world';
    problems.push('section moved: australia -> world (overseas place or club named; no Australian place named)');
    return true;
  }
  const requirement = SECTION_REQUIRES_PLACE[value.section];
  if (!requirement) return false;

  const requiredKinds = new Set(requirement.kinds || []);
  const configuredInterests = interests === undefined ? DEFAULT_INTERESTS : interests;
  const evidence = sectionEvidence(item, value);
  if (value.section === 'tasmania') {
    const placeTerms = configuredInterests
      .filter(entry => entry.kind === 'place')
      .flatMap(entry => entry.terms || []);
    const places = matchTasmanianPlaces(evidence, placeTerms, { tasmanianSource: isTasmanianSource(item) });
    if (places.unambiguous.length > 0 || places.needsCompanion.length > 0) return false;
  } else {
    const matched = matchInterests(evidence, configuredInterests);
    if (matched.some(match => requiredKinds.has(match.kind))) return false;
  }

  const from = value.section;
  value.section = requirement.fallback;
  problems.push(`section moved: ${from} -> ${value.section} (no ${requirement.placeName || 'required'} place named)`);
  return true;
}

function words(text) {
  return String(text).trim().match(/\S+/g) || [];
}

function isVagueHeadline(headline) {
  return words(headline).length <= 3;
}

function stripHeadlineFullStop(headline) {
  const unlabelled = headline.replace(HEADLINE_LABEL, '').trim();
  return /[a-z0-9]\.$/.test(unlabelled) ? unlabelled.slice(0, -1) : unlabelled;
}

function isSectionKicker(kicker, sectionId) {
  const section = SECTIONS.find(candidate => candidate.id === sectionId);
  if (!section) return false;
  const normalised = kicker.toLocaleLowerCase('en-AU');
  return [section.id, section.title]
    .flatMap(name => [name, `${name} news`])
    .some(name => normalised === name.toLocaleLowerCase('en-AU'));
}

function kickerEvidence(item, value) {
  // Titles are often in Title Case, so a capital there proves nothing; Google
  // News teasers repeat the title, so strip it from them too.
  const title = String(item.title || '').trim();
  const teasers = [item.description, ...(Array.isArray(item.merged_descriptions) ? item.merged_descriptions : [])]
    .map(text => (title && typeof text === 'string' ? text.split(title).join(' ') : text));
  return [
    value.summary,
    value.detail,
    ...teasers,
    item.article_content,
  ].filter(text => typeof text === 'string' && text.trim()).join('\n');
}

// "Nas" in a kicker is "NAS" when the story spells it that way.
function acronymForm(word, evidence) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = evidence.match(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu'));
  return (match || []).find(found => /^[A-Z0-9]{2,}$/.test(found)) || null;
}

function capitalisedMidSentence(word, evidence) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'gu');
  for (const match of evidence.matchAll(regex)) {
    const before = evidence.slice(0, match.index);
    if (before.trim() && !/(?:[.!?]\s*|\n\s*)$/.test(before)) return true;
  }
  return false;
}

function sentenceCaseKicker(kicker, evidence) {
  return kicker.split(/(\s+)/).map((part, index, all) => {
    if (/^\s+$/.test(part)) return part;
    const wordIndex = all.slice(0, index).filter(value => value && !/^\s+$/.test(value)).length;
    if (wordIndex === 0) return part;
    const match = part.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’.-]*)([^\p{L}\p{N}]*)$/u);
    if (!match) return part.toLocaleLowerCase('en-AU');
    const [, prefix, word, suffix] = match;
    if (/^[A-Z0-9]{2,}$/.test(word) || capitalisedMidSentence(word, evidence)) return part;
    const acronym = acronymForm(word, evidence);
    if (acronym) return `${prefix}${acronym}${suffix}`;
    return `${prefix}${word.toLocaleLowerCase('en-AU')}${suffix}`;
  }).join('');
}

// An interest label, or no kicker at all: an outlet name ("ABC Tasmania" on a
// Northern Territory story) says nothing about the topic.
function replacementKicker(item, value) {
  return (item.interest_matches || []).map(match => match.label).find(candidate => {
    if (typeof candidate !== 'string' || !candidate.trim()) return false;
    const text = candidate.trim();
    return !isSectionKicker(text, value.section) && !isBarePlaceName(text) && !META_KICKER.test(text);
  }) || '';
}

// Interest labels and outlet names are proper names; never re-case them.
function namedKickers(item) {
  return new Set([
    ...(item.interest_matches || []).map(match => match.label),
    item.source_name,
    ...(item.sources || []).map(source => source.name),
    'News',
  ].filter(name => typeof name === 'string' && name));
}

function repairKicker(value, item, problems) {
  if (value.kicker && (isBarePlaceName(value.kicker) || META_KICKER.test(value.kicker))) {
    const original = value.kicker;
    value.kicker = replacementKicker(item, value);
    problems.push(`Kicker was only a place or meta label: ${original}`);
  } else if (value.kicker && isSectionKicker(value.kicker, value.section)) {
    problems.push('Kicker repeated the section name');
    value.kicker = replacementKicker(item, value);
  }
  if (value.kicker && (words(value.kicker).length > 3 || value.kicker.length > 24)) {
    problems.push('Kicker exceeded three words or 24 characters');
    // The same filtered choice as the other repairs: the first interest label
    // can be a bare place ("Tasmania"), which a kicker must never be.
    value.kicker = replacementKicker(item, value)
      || words(value.kicker).slice(0, 2).join(' ').replace(/[^\p{L}\p{N}]+$/u, '');
  }
  if (!namedKickers(item).has(value.kicker)) {
    value.kicker = sentenceCaseKicker(value.kicker, kickerEvidence(item, value));
  }
}

function shortenDetail(detail) {
  const wordMatches = [...detail.matchAll(/\S+/g)];
  if (wordMatches.length <= 160) return { detail, problem: null, fatal: false };
  if (wordMatches.length >= 400) {
    return {
      detail,
      problem: 'Detail was 400 words or longer',
      fatal: true,
    };
  }
  const boundary = wordMatches[159].index + wordMatches[159][0].length;
  const prefix = detail.slice(0, boundary);
  const endings = [...prefix.matchAll(/[.!?](?:["'”’])?(?=\s|$)/g)];
  const last = endings.at(-1);
  if (!last) {
    return {
      detail,
      problem: 'Detail exceeded 160 words without a safe sentence boundary',
      fatal: true,
    };
  }
  return {
    detail: prefix.slice(0, last.index + last[0].length).trim(),
    problem: 'Detail exceeded 160 words and was shortened',
    fatal: false,
  };
}

function validateWrite(raw, item, interests) {
  const parsed = parseObject(raw);
  if (!parsed) {
    const value = fallbackWrite(item);
    const problems = ['Writer output was not valid JSON'];
    const sectionMoved = enforceSectionRequirements(value, item, interests, problems);
    return sectionMoved ? { ok: false, value, problems, sectionMoved } : { ok: false, value, problems };
  }

  const problems = [];
  let fatal = false;
  const value = {
    is_news: parsed.is_news,
    headline: typeof parsed.headline === 'string' ? stripHeadlineFullStop(parsed.headline.trim()) : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    detail: typeof parsed.detail === 'string' ? parsed.detail.trim() : '',
    kicker: typeof parsed.kicker === 'string' ? parsed.kicker.trim() : '',
    section: parsed.section,
  };
  const missingFields = missingTextFields(value);

  if (typeof value.is_news !== 'boolean') {
    problems.push('is_news was not a boolean');
    value.is_news = true;
  }
  for (const [field, label] of [['headline', 'Headline'], ['summary', 'Summary'], ['detail', 'Detail']]) {
    if (!value[field]) {
      problems.push(`${label} was empty`);
      fatal = true;
    }
  }
  if (!isSectionId(value.section)) {
    problems.push(`Unknown section: ${String(value.section)}`);
    value.section = defaultSection(item);
  }
  if (!value.kicker) {
    problems.push('Kicker was empty');
    value.kicker = (item.interest_matches || []).map(match => match.label).find(Boolean)
      || item.source_name
      || 'News';
  }
  if (fatal) {
    const fallback = fallbackWrite(item);
    const sectionMoved = enforceSectionRequirements(fallback, item, interests, problems);
    repairKicker(fallback, item, problems);
    return sectionMoved
      ? { ok: false, value: fallback, problems, sectionMoved }
      : { ok: false, value: fallback, problems };
  }

  const facts = guardFacts(value, item);
  Object.assign(value, facts.value);
  problems.push(...facts.problems);
  if (value.detail) {
    const shortened = shortenDetail(value.detail);
    value.detail = shortened.detail;
    if (shortened.problem) problems.push(shortened.problem);
  }

  const sectionMoved = enforceSectionRequirements(value, item, interests, problems);
  repairKicker(value, item, problems);
  const result = sectionMoved ? { ok: true, value, problems, sectionMoved } : { ok: true, value, problems };
  if (missingFields.length > 0) result.missingTextFields = missingFields;
  if (facts.facts_removed > 0) result.facts_removed = facts.facts_removed;
  if (facts.numbers_unsupported > 0) result.numbers_unsupported = facts.numbers_unsupported;
  return result;
}

function emptySections() {
  return Object.fromEntries(SECTION_IDS.map(id => [id, []]));
}

function rankValue(story, index) {
  return Number.isFinite(Number(story.rank)) ? Number(story.rank) : index + 1;
}

function deterministicOrder(stories) {
  return stories.map((story, index) => ({ story, index }))
    .sort((a, b) =>
      ((Number(b.story.coverage) || 0) - (Number(a.story.coverage) || 0))
      || (interestScore(b.story.interest_matches) - interestScore(a.story.interest_matches))
      || (rankValue(a.story, a.index) - rankValue(b.story, b.index))
      || (a.index - b.index)
    )
    .map(entry => entry.story);
}

function storiesByRank(stories) {
  return stories.map((story, index) => ({ story, index }))
    .sort((a, b) => (rankValue(a.story, a.index) - rankValue(b.story, b.index)) || (a.index - b.index))
    .map(entry => entry.story);
}

function isCommunitySource(source) {
  const name = String(source?.name || source || '');
  if (/^(?:reddit|r\/|hacker news|hn)\b/i.test(name)) return true;
  const url = String(source?.url || '');
  return /(?:^|\.)reddit\.com\/|news\.ycombinator\.com\//i.test(url);
}

function hasOnlyCommunitySources(story) {
  if (Array.isArray(story.sources) && story.sources.length > 0) {
    return story.sources.every(isCommunitySource);
  }
  return isCommunityItem(story);
}

function eligibleTopCandidate(story, techCount) {
  return !hasOnlyCommunitySources(story)
    && (!TOP_TECH_SECTIONS.has(story.section) || techCount < 2);
}

function repairTopSelection(initialTop, stories, target) {
  const byId = new Map(stories.map(story => [story.id, story]));
  const top = [];
  const removed = [];
  let techCount = 0;
  for (const id of initialTop) {
    const story = byId.get(id);
    let reason = null;
    if (hasOnlyCommunitySources(story)) reason = 'community-only source';
    else if (TOP_TECH_SECTIONS.has(story.section) && techCount >= 2) {
      reason = 'more than two tech/community sections';
    }
    if (reason) removed.push({ removed: id, added: null, reason });
    else {
      top.push(id);
      if (TOP_TECH_SECTIONS.has(story.section)) techCount++;
    }
  }

  const remaining = storiesByRank(stories).filter(story => !top.includes(story.id));
  const ordered = [
    ...remaining.filter(story => TOP_NEWS_SECTIONS.has(story.section)),
    ...remaining.filter(story => !TOP_NEWS_SECTIONS.has(story.section)),
  ];
  for (const story of ordered) {
    if (top.length >= target) break;
    if (initialTop.includes(story.id) && removed.some(entry => entry.removed === story.id)) continue;
    if (!eligibleTopCandidate(story, techCount)) continue;
    top.push(story.id);
    if (TOP_TECH_SECTIONS.has(story.section)) techCount++;
    const replacement = removed.find(entry => entry.added === null);
    if (replacement) replacement.added = story.id;
  }
  return { top, replacements: removed };
}

function placeRemaining(stories, top, sectionSize, preferred = emptySections()) {
  const sections = emptySections();
  const more = emptySections();
  const topSet = new Set(top);
  const byId = new Map(stories.map(story => [story.id, story]));
  const placed = new Set(top);

  for (const sectionId of SECTION_IDS) {
    // Stories three or more outlets carried lead their section: the editor
    // put a small "Show HN" app above a story seven outlets ran.
    const wide = deterministicOrder(stories)
      .filter(story => story.section === sectionId && (Number(story.coverage) || 0) >= 3)
      .map(story => story.id);
    // Then stories about something the reader runs or uses (Plex, Unraid, the
    // arr apps): the editor left "Plex 1.6" and an arr-suite replacement in "more".
    // In the news sections only reporting is lifted: an r/popular musing about
    // Coles and Woolworths bag fees rose to third in Australia.
    const product = stories
      .filter(story => story.section === sectionId
        && (story.interest_matches || []).some(match => match.kind === 'product')
        && !(TOP_NEWS_SECTIONS.has(sectionId) && hasOnlyCommunitySources(story)))
      .sort((a, b) => interestScore(b.interest_matches) - interestScore(a.interest_matches))
      .map(story => story.id);
    for (const id of [...wide, ...product, ...(preferred[sectionId] || [])]) {
      const story = byId.get(id);
      if (!story || story.section !== sectionId || placed.has(id) || sections[sectionId].length >= sectionSize) continue;
      sections[sectionId].push(id);
      placed.add(id);
    }
    for (const story of storiesByRank(stories)) {
      if (story.section !== sectionId || topSet.has(story.id) || placed.has(story.id)) continue;
      if (sections[sectionId].length < sectionSize) {
        sections[sectionId].push(story.id);
        placed.add(story.id);
      }
    }
  }

  for (const story of storiesByRank(stories)) {
    if (!placed.has(story.id) && isSectionId(story.section)) more[story.section].push(story.id);
  }
  return { sections, more };
}

function deterministicEdit(stories, { sectionSize, topSize }) {
  const ordered = deterministicOrder(stories);
  const qualified = ordered.filter(story => (Number(story.coverage) || 0) >= 3 || (story.interest_matches || []).length > 0);
  const rest = ordered.filter(story => !qualified.includes(story));
  const initialTop = [...qualified, ...rest].slice(0, Math.min(topSize.min, stories.length)).map(story => story.id);
  const repaired = repairTopSelection(initialTop, stories, Math.min(topSize.min, stories.length));
  const top = repaired.top;
  const placed = placeRemaining(stories, top, sectionSize);
  return {
    top,
    ...placed,
    ...(repaired.replacements.length > 0 ? { topReplacements: repaired.replacements } : {}),
  };
}

function validateEdit(raw, stories, { sectionSize, topSize }) {
  const parsed = parseObject(raw);
  if (!parsed || !Array.isArray(parsed.top) || !parsed.sections || typeof parsed.sections !== 'object' || Array.isArray(parsed.sections)) {
    return {
      ...deterministicEdit(stories, { sectionSize, topSize }),
      fallback: 'full',
      problems: ['Editor output was not valid JSON'],
    };
  }

  const problems = [];
  const byId = new Map(stories.map(story => [story.id, story]));
  const top = [];
  const seenTop = new Set();
  for (const id of parsed.top) {
    if (!byId.has(id)) {
      problems.push(`Unknown top story id: ${String(id)}`);
      continue;
    }
    if (seenTop.has(id)) {
      problems.push(`Duplicate top story id: ${id}`);
      continue;
    }
    seenTop.add(id);
    top.push(id);
  }
  if (top.length > topSize.max) {
    problems.push(`Top list had more than ${topSize.max} valid stories and was clamped`);
    top.length = topSize.max;
  }
  const minimumTop = Math.min(topSize.min, stories.length);
  if (top.length < minimumTop) {
    problems.push(`Top list had fewer than ${topSize.min} valid stories and was filled`);
  }
  const targetTop = Math.min(topSize.max, Math.max(minimumTop, top.length));
  const repairedTop = repairTopSelection(top, stories, targetTop);
  top.length = 0;
  top.push(...repairedTop.top);
  for (const replacement of repairedTop.replacements) {
    problems.push(replacement.added
      ? `Top story ${replacement.removed} was replaced by ${replacement.added} (${replacement.reason})`
      : `Top story ${replacement.removed} was removed (${replacement.reason}; no eligible replacement)`);
  }

  const preferred = emptySections();
  const assigned = new Set();
  for (const sectionId of SECTION_IDS) {
    const seenInSection = new Set();
    const ids = Array.isArray(parsed.sections[sectionId]) ? parsed.sections[sectionId] : [];
    for (const id of ids) {
      if (seenInSection.has(id)) {
        problems.push(`Duplicate section story id: ${String(id)}`);
        continue;
      }
      seenInSection.add(id);
      const story = byId.get(id);
      if (!story) {
        problems.push(`Unknown section story id: ${String(id)}`);
        continue;
      }
      if (top.includes(id)) {
        problems.push(`Story ${id} was already selected for top`);
        continue;
      }
      if (story.section !== sectionId) {
        problems.push(`Story ${id} was placed in the wrong section`);
        continue;
      }
      if (assigned.has(id)) {
        problems.push(`Duplicate section story id: ${id}`);
        continue;
      }
      if (preferred[sectionId].length < sectionSize) {
        preferred[sectionId].push(id);
        assigned.add(id);
      }
    }
  }

  const editorSelectionSurvived = seenTop.size > 0 || assigned.size > 0;
  const fallback = problems.length === 0 ? 'none' : (editorSelectionSurvived ? 'partial' : 'full');
  return {
    top,
    ...placeRemaining(stories, top, sectionSize, preferred),
    fallback,
    problems,
    ...(repairedTop.replacements.length > 0 ? { topReplacements: repairedTop.replacements } : {}),
  };
}

module.exports = {
  isVagueHeadline,
  missingTextFields,
  isCommunityHelpRequest,
  isUnansweredCommunityQuestion,
  validateWrite,
  validateEdit,
  deterministicEdit,
  defaultSection,
};
