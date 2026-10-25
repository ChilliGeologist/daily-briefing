'use strict';

const crypto = require('node:crypto');
const { matchInterests } = require('./pipeline/writer/interests');
const { canonicalUrl } = require('./pipeline/normalise');
const { deterministicSameStory } = require('./pipeline/cluster');

const SECURITY_OR_OUTAGE = /\b(?:vulnerabilit(?:y|ies)|CVE-\d{4}-\d+|exploit(?:ed|s|ing)?|breach(?:ed|es)?|zero[- ]day|patch(?:ed|es|ing)?\s+now|critical\s+(?:security\s+)?update|outage|compromis(?:e|ed|es|ing)|ransomware|malware|hack(?:ed|ers?|ing)|security\s+(?:flaw|fix|issue|release)|remote\s+code\s+execution|RCE)\b/i;
const EXTRA_NORTHERN_PLACES = /\b(?:Central North|North East|North West Coast)\b/;
const NEAR_HOME_LABELS = new Set(['West Tamar', 'Launceston', 'Northern Tasmania']);
const URGENT_CAP = 3;

function itemText(item) {
  return [item && item.title, item && item.description]
    .filter(Boolean)
    .join('\n');
}

function isWarningOrAcsc(item) {
  return item && (item.source_kind === 'warning' || /\bACSC\b/i.test(String(item.source_name || '')));
}

function hasNearHomePlace(text, matches) {
  return (matches || []).some(match => match.kind === 'place' && NEAR_HOME_LABELS.has(match.label))
    || EXTRA_NORTHERN_PLACES.test(text);
}

function selectAlertCandidates(items, interests) {
  const candidates = [];
  for (const item of items || []) {
    const text = itemText(item);
    const matches = matchInterests(text, interests);
    if (item && item.source_kind === 'warning'
      && !matches.some(match => match.label === 'Emergencies')) {
      matches.push({ label: 'Emergencies', kind: 'topic', weight: 3, urgent: true, term: 'warning' });
    }
    const urgent = matches.filter(match => match.urgent);
    if (urgent.length === 0) continue;

    const emergency = urgent.some(match => match.kind === 'topic' && match.label === 'Emergencies');
    if (emergency && hasNearHomePlace(text, matches)) {
      candidates.push({ item, kind: 'emergency', kicker: 'Emergency near home', matches });
      continue;
    }

    const product = urgent.some(match => match.kind === 'product');
    if (product && (SECURITY_OR_OUTAGE.test(text) || isWarningOrAcsc(item))) {
      candidates.push({ item, kind: 'security', kicker: 'Security', matches });
    }
  }
  return candidates;
}

function alertDecision({ hour, sentCount, kind }) {
  if (Number(sentCount) >= URGENT_CAP) return { allowed: false, reason: 'daily cap reached' };
  const quiet = Number(hour) >= 22 || Number(hour) < 6;
  if (quiet && kind !== 'emergency') return { allowed: false, reason: 'quiet hours' };
  return { allowed: true, reason: null };
}

function topHeadline(briefing) {
  const sections = briefing && Array.isArray(briefing.sections) ? briefing.sections : [];
  const top = sections.find(section => section && (
    section.id === 'top' || section.title === 'You should know'
  ));
  if (top && Array.isArray(top.items) && top.items[0] && top.items[0].title) return top.items[0].title;
  for (const section of sections) {
    const lead = [...(section.items || []), ...(section.more || [])][0];
    if (lead && lead.title) return lead.title;
  }
  return (briefing && briefing.headline) || 'Your morning paper is ready.';
}

function buildMorningPayload(briefing, editionId) {
  return {
    title: 'The Daily Gump is ready',
    body: topHeadline(briefing),
    url: editionId == null ? '/' : `/?edition=${encodeURIComponent(editionId)}`,
    tag: editionId == null ? 'morning-edition' : `morning-edition-${editionId}`,
  };
}

function buildAlertPayload(alert) {
  return {
    title: alert.kicker,
    body: alert.headline,
    url: `/?alert=${encodeURIComponent(alert.id)}`,
    tag: `urgent-alert-${alert.id}`,
  };
}

function buildTestPayload() {
  return {
    title: 'Notifications are working',
    body: 'The Daily Gump can reach you.',
    url: '/',
    tag: 'notification-test',
  };
}

function parseAlertVerdict(raw) {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { return null; }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.urgent !== 'boolean') return null;
  if (typeof parsed.reason !== 'string') return null;
  const reason = parsed.reason.trim();
  if (!reason || /[\r\n]/.test(reason) || reason.length > 240) return null;
  return { urgent: parsed.urgent, reason };
}

function titleHash(title) {
  const normalised = String(title || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalised).digest('hex');
}

function watchIdentity(item) {
  return {
    canonical_url: canonicalUrl(item && (item.canonical_url || item.url)) || '',
    title_hash: titleHash(item && item.title),
  };
}

function localDateAndHour(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

function sameAlertStory(a, b) {
  return deterministicSameStory(a || {}, b || {});
}

function markAlertedStories(briefing, alerts) {
  for (const section of (briefing && briefing.sections) || []) {
    for (const story of [...(section.items || []), ...(section.more || [])]) {
      const alert = (alerts || []).find(candidate => sameAlertStory({
        ...story,
        description: story.summary,
      }, {
        title: candidate.headline,
        description: candidate.summary,
        canonical_url: candidate.canonical_url,
        url: candidate.original_url,
      }));
      if (alert) story.alerted_at = alert.sent_at;
    }
  }
  return briefing;
}

module.exports = {
  SECURITY_OR_OUTAGE,
  URGENT_CAP,
  selectAlertCandidates,
  alertDecision,
  buildMorningPayload,
  buildAlertPayload,
  buildTestPayload,
  parseAlertVerdict,
  titleHash,
  watchIdentity,
  localDateAndHour,
  sameAlertStory,
  markAlertedStories,
};
