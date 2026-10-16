'use strict';

const { DEFAULT_INTERESTS, interestScore, matchInterests } = require('./interests');
const { guardFacts } = require('./facts');
const { communityReplies, isCommunityItem } = require('./prompts');
const {
  hasAnyAustralianEvidence,
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
const MISSING_TEXT = /\b(?:the\s+headline\s+(?:suggests|indicates|states|implies)|no\s+accessible\s+(?:(?:article|story|page|source)\s+)(?:text|content|details?|information)|no\s+(?:further\s+|additional\s+|other\s+|accessible\s+)?(?:(?:article|story|page|source|supplied|available)\s+)?(?:text|content|details?|information|viewpoints?)(?:\s+or\s+[\p{L}\s]+?)?\s+(?:was|were|is|are|has\s+been|have\s+been)\s+(?:provided|available|included|supplied|given)|no\s+(?:article|story|source|supplied)\s+(?:text|content)|(?:article|story|source|supplied|available)\s+(?:text|content)\s+(?:was|were|is|are)\s+(?:not\s+(?:provided|available|included|supplied|given)|missing|absent)|in\s+the\s+(?:available|supplied|provided)\s+text|(?:unable|impossible)\s+to\s+(?:write|provide|summari[sz]e)|summary\s+(?:is\s+|was\s+)?impossible|no\s+summary\s+can\s+be)\b/iu;
// The writer describing the page instead of the story: "The provided text is
// not a genuine news story and appears to be a paywall or subscription
// prompt" (404 Media, 2026-10-15).
const PAGE_NOT_STORY = /\b(?:(?:the\s+)?(?:provided|supplied|available)\s+(?:text|page|content|article|story)\s+(?:is|was)\s+(?:not\b|(?:a\s+)?paywalled\s+(?:article|page|story)\b)|not\s+a\s+genuine\s+(?:news\s+)?(?:story|article)|appears\s+to\s+be\s+(?:a|an)\s+(?:paywall|subscription|sign-?up|login|log-in|cookie)\b)/i;
const PAGE_DESCRIPTION = /\b(?:no substantial news content|promotional material|subscrib(?:e|er|ing|tion)|membership|this article|this page|the page)\b/i;
const NO_FACTUAL_NEWS = /\bno\s+factual\s+news\s+(?:details?|information)\s+(?:was|were|is|are|has\s+been|have\s+been)\s+(?:provided|available|included|supplied|given)\b/i;
const META_REFERENCE = /\b(?:this\s+(?:story|article|post|text|page)|the\s+(?:provided|supplied)\s+(?:text|content))\b/i;
const META_KICKER = /^(?:headline mystery|no story|no details|subscription wall|paywall|login page|cookie notice)$/i;
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
  return ['summary', 'kicker'].filter(field => {
    const text = String(value?.[field] || '').trim();
    return MISSING_TEXT.test(text) || NO_FACTUAL_NEWS.test(text) || PAGE_NOT_STORY.test(text) || PAGE_DESCRIPTION.test(text)
      || text.split(/(?<=[.!?])\s+|\n+/u).some(sentence =>
        /\b(?:no|not)\b/i.test(sentence) && META_REFERENCE.test(sentence)
      )
      || (field === 'kicker' && META_KICKER.test(text));
  });
}

function isCommunityHelpRequest(item) {
  if (!isCommunityItem(item)) return false;
  // A post sharing an outside article carries that article's headline
  // ("…functionally illiterate. How can we fix this?"), not the poster's plea.
  if (item.external_url) return false;
  const title = String(item.title || '').trim();
  const description = String(item.description || '').trim();
  // Personal setup/buying help is not edition material, however popular the
  // thread becomes. General questions to the community ("Do you patch…?")
  // remain eligible.
  if (/\b(?:can you|how do i|how can i|how can|what(?:'|’)s next|what next|should i|any advice|need advice|help with|help me|is it worth)\b/i.test(title)) return true;
  if (/\bwhich\b.+\bshould\b/i.test(title) || /\brecommendations?\s*\?\s*$/i.test(title)) return true;
  if (/^(?:my\b|i\b).+\?\s*$/i.test(title)) return true;
  if (/^help me\b/i.test(title) || /\bhow do i\b/i.test(title) || /\bhow to handle\b/i.test(title)) return true;
  if (/\b(?:what should i|should i)\b/i.test(title)) return true;
  if (/\bquestions?\s*\??$/i.test(title)) return true;
  if (/\bfor (?:a )?beginner\b/i.test(title)) return true;
  if (/\bwhich\b.+\bfor\b/i.test(title)) return true;
  if (/\b\S+\s+or\s+.+\s+for\s+(?:a\s+)?(?:server|nas|homelab)\b/i.test(title)) return true;
  if (/\b(?:advice|recommendations?)\b/i.test(title) || /^(?:please\s+)?recommend\b/i.test(title)) return true;
  if (/\b(?:suggestions?|help|ideas?|input|feedback)\s+(?:sought|needed|wanted|requested|please)\b/i.test(title)) return true;
  if (/^looking for\b/i.test(title) || /\bideas?\s*\??$/i.test(title)) return true;
  if (/^is\b.+\bgood enough for\b/i.test(title) || /^moving to\b.+\bor\b/i.test(title)) return true;
  if (/\bquestions?\s+about\b/i.test(title)) return true;
  if (/\bwhich\b.+\bshould\b/i.test(title)) return true;
  if (/\b(?:advice|suggestions?|feature request)\b/i.test(title)) return true;
  if (/\b(?:instead of adding|please add)\b/i.test(title)) return true;
  if (/\b(?:suggestion|feature request)\b/i.test(String(item.link_flair_text || item.flair || ''))) return true;
  if (words(title).length <= 12
    && (/\b(?:any|some)\s+(?:advice|recommendations?|suggestions?|guidance|tips?)\b/i.test(description)
      || /\b(?:want(?:ed)?|would like|(?:am|'m)\s+(?:looking|hoping))\s+to\s+know\b/i.test(description))) {
    return true;
  }
  // A short, plain title whose post asks for help ("My Home Firewall": "Please
  // suggest your valuable suggestions"); the writer's retry would otherwise
  // dress it up as a headline.
  return words(title).length <= 6
    && /\b(?:just bought|good purchase|any advice|any suggestions?|please suggest|please help|need(?:s)? help|(?:can|could|would)\s+(?:someone|anyone|somebody)\s+(?:please\s+)?(?:help|explain|tell|suggest)|any ideas|what am i doing wrong)\b/i.test(description);
}

function isHackerNewsItem(item) {
  return /^(?:hacker news|hn)\b/i.test(String(item.source_name || ''))
    || ['hackernews', 'hacker_news', 'hn'].includes(String(item.source_type || '').toLowerCase());
}

function isProjectPost(item) {
  const text = `${item.title || ''}\n${item.description || ''}`;
  if (isHackerNewsItem(item) && /^\s*Show HN\b/i.test(String(item.title || ''))) return true;
  if (!isCommunityItem(item) && !isHackerNewsItem(item)) return false;
  return /\b(?:I made|I built|my app|I created|I wrote|introducing|just released|I released|we released|we build|we built|we made)\b/i.test(text)
    || /\b(?:I['’]m|I am|we['’]re|we are)\s+(?:an?\s+|the\s+)?(?:developer|creator|author)\s+of\b/i.test(text)
    || /\bv?\d+\.\d+(?:\.\d+)?\b.{0,40}\b(?:release[ds]?|launch(?:ed)?)\b/i.test(text)
    || /\b(?:release[ds]?|launch(?:ed)?)\b.{0,40}\bv?\d+\.\d+(?:\.\d+)?\b/i.test(text);
}

function projectDropReason(item) {
  if (!isProjectPost(item)) return null;
  if ((item.interest_matches || []).some(match => match.kind === 'product')) return null;
  if (isHackerNewsItem(item) && (Number(item.score) || 0) >= 150) return null;
  if (String(item.source_type || '').toLowerCase() === 'reddit'
    && Number(item.list_position) >= 1 && Number(item.list_position) <= 5
    && (Number(item.real_reply_count) || communityReplies(item).length) >= 10) return null;
  return 'project post without enough attention';
}

function isNonNewsEssay(item) {
  const title = String(item.title || '').trim();
  return /^(?:The Double Headed Stack Allocator|Things to know when you get cancer)$/i.test(title)
    || /\b(?:tutorial|how to (?:code|program|implement|build a (?:compiler|allocator|data structure)))\b/i.test(title)
    || /^(?:Things|Lessons|Thoughts|Notes)\s+(?:I|we|to know)\b/i.test(title);
}

const SPORT_TERMS = /\b(?:AFLW?|NRLW?|rugby(?: league| union)?|Wallabies|Wallaroos|Matildas|Socceroos|A-League|cricket|tennis|ATP|WTA|Supercars?|Formula\s*(?:One|1)|F1|MotoGP|NBL|WNBL|golf|Bledisloe|Olympic(?:s)?|Paralympic(?:s)?|World Cup|State of Origin|Super Bowl|Ashes|racehorse|horse racing|thoroughbred|jockey|Caulfield Cup|Melbourne Cup)\b/i;

function isSportStory(item, value = item) {
  if (value.section === 'sport' || item.default_category === 'sport') return true;
  const urls = [item.url, item.canonical_url, item.external_url, item.article_url,
    ...(item.sources || []).map(source => source && source.url),
    ...(item.outlet_versions || []).map(version => version && version.url)];
  if (urls.some(raw => {
    try { return /\/(?:sport|sports)(?:\/|$)/i.test(new URL(raw).pathname); } catch (_) { return false; }
  })) return true;
  // Extraction can include a whole site's related-story footer. Only the
  // opening article words are topic evidence; later mentions would turn an AI
  // or crime story into sport because a footer linked to an AFL item.
  const articleLead = String(item.article_content || '').split(/\s+/).slice(0, 120).join(' ');
  const text = [item.title, item.description, articleLead, value.headline, value.summary].filter(Boolean).join(' ');
  // Stadium construction, funding and development are infrastructure/politics
  // stories even when the venue is described as an AFL stadium.
  if (/\bstadium\b/i.test(text)
    && /\b(?:build(?:er|ing)?|construction|cost|price|hotel|development|planning|funding)\b/i.test(text)
    && !/\b(?:match|game|season|player|team|coach|win|loss|grand final)\b/i.test(text)) return false;
  return SPORT_TERMS.test(text);
}

function sportDropReason(item, value = item) {
  const text = `${item.title || ''} ${item.description || ''} ${value.headline || ''} ${value.summary || ''}`;
  const bigEvent = /\b(?:grand final|Olympic(?:s)?|Paralympic(?:s)?|Melbourne Cup|NBA Finals|Super Bowl|Ashes|Bledisloe\s+(?:Cup\s+)?decider|Australian Open|State of Origin\s+decider)\b/i.test(text)
    || (/\bBledisloe Cup\b/i.test(text) && /\bfinal All Blacks Test\b/i.test(text))
    || /\bWorld Cup\b.{0,60}\b(?:final|semi-?final|quarter-?final|knockout|champion|decider)\b|\b(?:final|semi-?final|quarter-?final|knockout|champion|decider)\b.{0,60}\bWorld Cup\b/i.test(text);
  if (bigEvent || (Number(item.coverage) || 0) >= 4) return null;
  const tasmanianTeam = /\b(?:JackJumpers|Tasmania Devils|Tasmania(?:'s|’s)? Jewels)\b/i.test(text)
    || (/\bJewels\b/i.test(text) && (item.interest_matches || []).some(match => match.kind === 'place'))
    || (item.interest_matches || []).some(match => ['JackJumpers', 'Tasmania Devils'].includes(match.label));
  if (tasmanianTeam && (Number(item.coverage) || 0) >= 2) return null;
  return 'sport below significance threshold';
}

function isProtectedGamingNews(item) {
  const matchesProduct = (item.interest_matches || []).some(match =>
    match.kind === 'product' && ['Dota 2', 'Old School RuneScape'].includes(match.label)
  ) || /^(?:r\/DotA2|r\/(?:oldschool)?runescape|Dota 2|Old School RuneScape|RuneScape)\b/i.test(String(item.source_name || ''));
  if (!matchesProduct) return false;
  const title = String(item.title || '');
  const qualifies = /\b(?:update|patch|gameplay patch|game update|hotfix|joins?|signs?|transfer|roster)\b/i.test(title)
    || /\bwins?\b.+\b(?:tournament|major|championship|cup|league)\b/i.test(title);
  if (!qualifies) return false;
  const replies = Number(item.real_reply_count) || communityReplies(item).length;
  return replies >= 3 || !isCommunityItem(item);
}

function writingRetryReasons(value) {
  const reasons = [];
  const headline = String(value && value.headline || '').trim();
  if (/^\p{Ll}/u.test(headline)) reasons.push('headline starts with a lower-case letter');
  const quoteLike = /^["“‘].+["”’]$/u.test(headline)
    || /^(?:I|We|They|He|She)(?:['’](?:d|ll|m|re|ve|s|t))\b/i.test(headline);
  const namedAfterFirst = (headline.match(/\b[A-Z][\p{L}'’.-]+\b/gu) || []).slice(1).length > 0;
  if (quoteLike && !namedAfterFirst) reasons.push('headline is only a quote with no named subject');
  const first = String(value && value.summary || '').trim().split(/(?<=[.!?])\s+/u)[0] || '';
  if (/^(?:It|This|These|Those|They|He|She)\b/i.test(first)
    || /^The\s+\p{Ll}/u.test(first)) {
    reasons.push('summary opens without naming anyone');
  }
  return reasons;
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
    kicker: interestLabel || outlet,
    section: defaultSection(item),
  };
}

function sectionEvidence(item, value) {
  return [
    item.title,
    value.headline,
    value.summary,
    value.kicker,
    item.description,
    ...(Array.isArray(item.merged_descriptions) ? item.merged_descriptions : []),
    item.article_content,
  ].filter(text => typeof text === 'string' && text.trim()).join('\n');
}

function enforceSectionRequirements(value, item, interests, problems) {
  const sourceList = [item.source_name, ...(item.sources || []).map(source => source && source.name)]
    .filter(Boolean).map(name => String(name).trim());
  const sourceNames = sourceList.join('\n');
  const specialistOrReddit = sourceList.length > 0 && sourceList.every(name =>
    /^(?:Hacker News(?:\s*\(API\))?|HN|Waxy|Kottke|404 Media|r\/[^\s]+)$/i.test(name)
  );
  let fixedSourceSection = null;
  const homelabTitle = /\b(?:self-host(?:ed|ing)?|selfhost(?:ed|ing)?|homelab)\b/i.test(String(item.title || ''));
  const homelabPublisher = /^(?:Jeff Geerling|ServeTheHome|selfh\.st|Home Assistant(?: Blog)?|Tailscale(?: Blog)?)$/im.test(sourceNames)
    || item.source_kind === 'release';
  if (homelabTitle || (sourceOutletCount(item) <= 1 && homelabPublisher)) {
    fixedSourceSection = 'homelab';
  } else if (/^(?:Bleeping Computer|The Register|Krebs(?: on Security)?|Australian Cyber Security Centre|ACSC)$/im.test(sourceNames)) {
    fixedSourceSection = 'tech';
  } else if (TOP_NEWS_SECTIONS.has(value.section) && specialistOrReddit
    && /^(?:Hacker News|HN|r\/linux)\b/im.test(sourceNames)) {
    fixedSourceSection = 'tech';
  } else if (TOP_NEWS_SECTIONS.has(value.section) && specialistOrReddit
    && /^(?:Waxy|Kottke|404 Media)\b/im.test(sourceNames)) {
    fixedSourceSection = 'internet';
  }
  if (fixedSourceSection && value.section !== fixedSourceSection) {
    problems.push(`section moved: ${value.section} -> ${fixedSourceSection} (${item.source_name || 'source'} source)`);
    value.section = fixedSourceSection;
    return true;
  }
  const sourceSection = SECTION_BY_SOURCE_CATEGORY[item.default_category]
    || ((Number(item.coverage) || 1) <= 1 ? SECTION_BY_SINGLE_SOURCE_CATEGORY[item.default_category] : undefined);
  if (sourceSection && (TOP_NEWS_SECTIONS.has(value.section)
    || (item.default_category === 'gaming' && value.section !== 'gaming'))) {
    problems.push(`section moved: ${value.section} -> ${sourceSection} (${item.default_category} source)`);
    value.section = sourceSection;
    return true;
  }
  if ((item.default_category === 'tech' || item.default_category === 'world')
    && (value.section === 'tasmania' || value.section === 'australia')
    && !hasAnyAustralianEvidence(sectionEvidence(item, value))) {
    const from = value.section;
    value.section = 'world';
    problems.push(`section moved: ${from} -> world (${item.default_category} source; no Australian evidence)`);
    return true;
  }
  if (value.section === 'world' && hasAustralianOnlyPlace(
    value.headline,
    value.summary,
    value.kicker,
    // Article text is left out: publishers' footers name Australian places
    // (an ABC footer moved the Russell Brand trial into Australia).
    item.title,
    item.description,
    ...(Array.isArray(item.merged_descriptions) ? item.merged_descriptions : [])
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
    value.kicker,
    item.title,
    item.description,
    ...(Array.isArray(item.merged_descriptions) ? item.merged_descriptions : []),
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
  // A sentence-style source title can establish a mid-sentence proper name.
  // A wholly Title Case title cannot: otherwise every generated label would
  // preserve the model's title casing.
  const title = String(item.title || '').trim();
  const titleWords = title.match(/\b\p{L}[\p{L}'’.-]*\b/gu) || [];
  const afterFirst = titleWords.slice(1).filter(word => /\p{L}/u.test(word));
  const titleIsTitleCase = afterFirst.length >= 2
    && afterFirst.every(word => /^\p{Lu}/u.test(word));
  const teasers = [item.description, ...(Array.isArray(item.merged_descriptions) ? item.merged_descriptions : [])]
    .map(text => (title && typeof text === 'string' ? text.split(title).join(' ') : text));
  return [
    ...(!titleIsTitleCase && title ? [title] : []),
    value.summary,
    ...teasers,
    item.article_content,
    ...(item.outlet_versions || []).flatMap(version => [version && version.headline, version && version.description, version && version.text]),
  ].filter(text => typeof text === 'string' && text.trim()).join('\n');
}

function kickerPrimaryEvidence(item, value) {
  return [
    item.title,
    value.summary,
    item.description,
    ...(Array.isArray(item.merged_descriptions) ? item.merged_descriptions : []),
  ].filter(text => typeof text === 'string' && text.trim()).join('\n');
}

// "Nas" in a kicker is "NAS" when the story spells it that way.
function acronymForm(word, evidence) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = evidence.match(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu'));
  return (match || []).find(found => /^[A-Z0-9]{2,}$/.test(found)
    && capitalisedMidSentence(found, evidence)) || null;
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

function appearsLowerCase(word, evidence) {
  const lower = word.toLocaleLowerCase('en-AU');
  if (word === lower) return false;
  const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'gu').test(evidence);
}

function sentenceCaseKicker(kicker, evidence, primaryEvidence) {
  return kicker.split(/(\s+)/).map((part, index, all) => {
    if (/^\s+$/.test(part)) return part;
    const wordIndex = all.slice(0, index).filter(value => value && !/^\s+$/.test(value)).length;
    if (wordIndex === 0) return part;
    const match = part.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’.-]*)([^\p{L}\p{N}]*)$/u);
    if (!match) return part.toLocaleLowerCase('en-AU');
    const [, prefix, word, suffix] = match;
    // The story title, summary and teasers are the clearest casing signal. A
    // lower-case use there beats a capitalised navigation heading or named
    // report buried later in extracted page text ("beta" beats "BETA").
    if (appearsLowerCase(word, primaryEvidence)) {
      return `${prefix}${word.toLocaleLowerCase('en-AU')}${suffix}`;
    }
    if (capitalisedMidSentence(word, evidence)) return part;
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
  value.kicker = sentenceCaseKicker(
    value.kicker,
    kickerEvidence(item, value),
    kickerPrimaryEvidence(item, value)
  );
}

function shortenSummary(summary) {
  const wordMatches = [...summary.matchAll(/\S+/g)];
  if (wordMatches.length <= 45) return { summary, problem: null };
  const boundary = wordMatches[44].index + wordMatches[44][0].length;
  const prefix = summary.slice(0, boundary);
  const endings = [...prefix.matchAll(/[.!?](?:["'”’])?(?=\s|$)/g)];
  const last = endings.at(-1);
  return {
    summary: last
      ? prefix.slice(0, last.index + last[0].length).trim()
      : `${prefix.trim().replace(/[,:;\-–—]+$/u, '')}.`,
    problem: 'Summary exceeded 45 words and was shortened',
  };
}

function validateWrite(raw, item, interests) {
  const parsed = parseObject(raw);
  if (!parsed) {
    const value = fallbackWrite(item);
    const problems = ['Writer output was not valid JSON'];
    const sectionMoved = enforceSectionRequirements(value, item, interests, problems);
    repairKicker(value, item, problems);
    return sectionMoved ? { ok: false, value, problems, sectionMoved } : { ok: false, value, problems };
  }

  const problems = [];
  let fatal = false;
  const value = {
    is_news: parsed.is_news,
    headline: typeof parsed.headline === 'string' ? stripHeadlineFullStop(parsed.headline.trim()) : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    kicker: typeof parsed.kicker === 'string' ? parsed.kicker.trim() : '',
    section: parsed.section,
  };
  const missingFields = missingTextFields(value);

  if (typeof value.is_news !== 'boolean') {
    problems.push('is_news was not a boolean');
    value.is_news = true;
  }
  for (const [field, label] of [['headline', 'Headline'], ['summary', 'Summary']]) {
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
  if (value.summary) {
    const shortened = shortenSummary(value.summary);
    value.summary = shortened.summary;
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

function sourceOutletCount(story) {
  const namedSources = new Set((story.sources || [])
    .map(source => String(source?.name || '').trim().toLocaleLowerCase('en-AU'))
    .filter(Boolean));
  return Math.max(Number(story.coverage) || 0, namedSources.size);
}

function isSingleOutletWithoutInterest(story) {
  return sourceOutletCount(story) <= 1 && (story.interest_matches || []).length === 0;
}

function eligibleTopCandidate(story, techCount) {
  return !hasOnlyCommunitySources(story)
    && !isSingleOutletWithoutInterest(story)
    && !(story.no_solo_top && sourceOutletCount(story) <= 1)
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
    else if (story.no_solo_top && sourceOutletCount(story) <= 1) reason = 'source is not eligible for solo top';
    else if (isSingleOutletWithoutInterest(story)) {
      reason = 'single-outlet story without an interest match';
    } else if (TOP_TECH_SECTIONS.has(story.section) && techCount >= 2) {
      reason = 'more than two tech/community sections';
    }
    if (reason) removed.push({ removed: id, added: null, reason });
    else {
      top.push(id);
      if (TOP_TECH_SECTIONS.has(story.section)) techCount++;
    }
  }

  const remaining = deterministicOrder(stories).filter(story => !top.includes(story.id));
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

function reportsDeath(story) {
  return /\b(?:dies?|died|dead|death|killed|fatal|body found)\b/i.test(`${story.headline || story.title || ''} ${story.summary || ''}`);
}

function canLead(story) {
  const placeMatched = (story.interest_matches || []).some(match => match.kind === 'place');
  const urgent = (story.interest_matches || []).some(match => match.urgent);
  return !placeMatched || urgent || reportsDeath(story);
}

function enforceLead(top, stories) {
  if (top.length === 0) return top;
  const byId = new Map(stories.map(story => [story.id, story]));
  const candidates = deterministicOrder(stories).filter(story => canLead(story) && eligibleTopCandidate(story, 0));
  const lead = candidates[0];
  if (!lead) return top;
  const reordered = top.filter(id => id !== lead.id);
  if (!top.includes(lead.id)) reordered.pop();
  return [lead.id, ...reordered];
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
  const top = enforceLead(repaired.top, stories);
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
  top.push(...enforceLead(repairedTop.top, stories));
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
  isProjectPost,
  projectDropReason,
  isNonNewsEssay,
  isProtectedGamingNews,
  isSportStory,
  sportDropReason,
  writingRetryReasons,
  validateWrite,
  validateEdit,
  deterministicEdit,
  defaultSection,
};
