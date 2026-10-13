'use strict';

const { interestScore, matchInterests } = require('./interests');
const {
  SECTIONS,
  SECTION_BY_INTEREST_KIND,
  SECTION_BY_INTEREST_LABEL,
  SECTION_REQUIRES_PLACE,
  isSectionId,
} = require('./sections');

const SECTION_IDS = SECTIONS.map(section => section.id);

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

function fallbackWrite(item) {
  const teaser = String(item.description || item.merged_descriptions?.[0] || '').trim();
  const interestLabel = (item.interest_matches || []).map(match => match.label).find(Boolean);
  const outlet = item.source_name || (item.sources || []).map(source => source.name).find(Boolean) || 'News';
  return {
    is_news: true,
    headline: String(item.title || '').trim(),
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
  const requirement = SECTION_REQUIRES_PLACE[value.section];
  if (!requirement) return false;

  const requiredKinds = new Set(requirement.kinds || []);
  const matched = matchInterests(sectionEvidence(item, value), interests);
  if (matched.some(match => requiredKinds.has(match.kind))) return false;

  const from = value.section;
  value.section = requirement.fallback;
  problems.push(`section moved: ${from} -> ${value.section} (no ${requirement.placeName || 'required'} place named)`);
  return true;
}

function words(text) {
  return String(text).trim().match(/\S+/g) || [];
}

function stripHeadlineFullStop(headline) {
  return /[a-z0-9]\.$/.test(headline) ? headline.slice(0, -1) : headline;
}

function isSectionKicker(kicker, sectionId) {
  const section = SECTIONS.find(candidate => candidate.id === sectionId);
  if (!section) return false;
  const normalised = kicker.toLocaleLowerCase('en-AU');
  return [section.id, section.title]
    .flatMap(name => [name, `${name} news`])
    .some(name => normalised === name.toLocaleLowerCase('en-AU'));
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
  let retainedSectionKicker = false;
  if (value.kicker && isSectionKicker(value.kicker, value.section)) {
    problems.push('Kicker repeated the section name');
    const interestLabel = (item.interest_matches || []).map(match => match.label).find(Boolean);
    if (interestLabel) value.kicker = interestLabel;
    else retainedSectionKicker = true;
  }
  if (value.kicker && !retainedSectionKicker && (words(value.kicker).length > 3 || value.kicker.length > 24)) {
    problems.push('Kicker exceeded three words or 24 characters');
    const interestLabel = (item.interest_matches || []).map(match => match.label).find(Boolean);
    value.kicker = interestLabel || words(value.kicker).slice(0, 2).join(' ').replace(/[^\p{L}\p{N}]+$/u, '');
  }
  if (value.detail) {
    const shortened = shortenDetail(value.detail);
    value.detail = shortened.detail;
    if (shortened.problem) problems.push(shortened.problem);
  }

  if (fatal) {
    const fallback = fallbackWrite(item);
    const sectionMoved = enforceSectionRequirements(fallback, item, interests, problems);
    return sectionMoved
      ? { ok: false, value: fallback, problems, sectionMoved }
      : { ok: false, value: fallback, problems };
  }

  const sectionMoved = enforceSectionRequirements(value, item, interests, problems);
  return sectionMoved ? { ok: true, value, problems, sectionMoved } : { ok: true, value, problems };
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

function placeRemaining(stories, top, sectionSize, preferred = emptySections()) {
  const sections = emptySections();
  const more = emptySections();
  const topSet = new Set(top);
  const byId = new Map(stories.map(story => [story.id, story]));
  const placed = new Set(top);

  for (const sectionId of SECTION_IDS) {
    for (const id of preferred[sectionId] || []) {
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
  const top = [...qualified, ...rest].slice(0, Math.min(topSize.min, stories.length)).map(story => story.id);
  const placed = placeRemaining(stories, top, sectionSize);
  return { top, ...placed };
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
  if (top.length < Math.min(topSize.min, stories.length)) {
    problems.push(`Top list had fewer than ${topSize.min} valid stories and was filled`);
    for (const story of deterministicOrder(stories)) {
      if (!top.includes(story.id)) top.push(story.id);
      if (top.length >= Math.min(topSize.min, stories.length)) break;
    }
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
  return { top, ...placeRemaining(stories, top, sectionSize, preferred), fallback, problems };
}

module.exports = { validateWrite, validateEdit, deterministicEdit, defaultSection };
