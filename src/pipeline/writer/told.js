'use strict';

const TOLD_SYSTEM_PROMPT = `Compare how news outlets told the same story. You see each outlet's headline and opening only, with quotes removed. Judge the outlet's own word choice and what it chose to lead with. Name at most three subjects that the coverage is for or against: a person, party, organisation, cause or government. For every outlet classify its stance as toward, against or plain. For toward or against, quote no more than 12 words verbatim from that outlet's supplied words. Plain is the default and its quote may be empty or omitted. Reporting an allegation is not itself against. Loaded words such as shock, slams, rage, disgraced, hero and brave; choosing which side's claim leads; and omitting one side's response can indicate a stance. Do not use political left/right labels.`;

const TOLD_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['subjects'],
  properties: {
    subjects: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'kind', 'stances'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['person', 'party', 'organisation', 'cause', 'government'] },
          stances: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['outlet', 'stance'],
              properties: {
                outlet: { type: 'string' },
                stance: { type: 'string', enum: ['toward', 'against', 'plain'] },
                quote: { type: 'string', description: 'Verbatim evidence for toward or against; empty or omitted for plain.' },
              },
            },
          },
        },
      },
    },
  },
});

function isRedditOutlet(version) {
  return /^(?:reddit|r\/)\b/i.test(String(version.name || ''))
    || /(?:^|\.)reddit\.com\//i.test(String(version.url || ''));
}

function distinctNonRedditVersions(story) {
  const seen = new Set();
  const output = [];
  for (const version of (story.outlet_versions || [])) {
    if (!version || isRedditOutlet(version)) continue;
    const key = String(version.name || '').trim().toLocaleLowerCase('en-AU');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push({
      name: String(version.name).trim(),
      headline: String(version.headline || '').trim(),
      description: String(version.description || '').trim(),
      url: String(version.url || '').trim(),
      text: String(version.text || version.description || '').trim(),
    });
  }
  return output;
}

function quoteComparable(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/["'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-AU');
}

const ATTRIBUTION = /\b(?:said|says|called|calls|told|according to|claimed|described\b.{0,30}\bas)\b/i;
const TESTIMONY_ATTRIBUTION = /\b(?:court\s+(?:has\s+)?heard|the\s+court\s+was\s+told|told\s+the\s+court|jury\s+heard|the\s+jury\s+was\s+told|told\s+the\s+jury|gave\s+evidence|testified|alleges|alleged|allegedly|prosecutors?\s+(?:said|say|says)|according\s+to\s+the\s+prosecution)\b/i;
const CLAIM_ATTRIBUTION = /\bclaims?\b/i;
const CLAIM_NOUN = /\b(?:the|his|her|its|their|these|those|such)\s+claims?\b/i;
const LEGAL_REPORT = /\b(?:accus(?:e[ds]?|ed|ation)|charg(?:e[ds]?|ed)|alleg(?:e[ds]?|ed|edly|ation)|pleads?|verdict|denies|denied|found guilty|sentenced)\b/i;
const LOADED_WORD = /\b(?:shock(?:ing)?|slams?|rage|disgraced|hero(?:ic)?|brave|cruel|reprehensible|despicable|betrayal|chaos|outrage(?:ous)?|humiliat(?:e[ds]?|ing)|coward(?:ly)?|evil|brutal)\b/i;

function wordCount(text) {
  return (String(text).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
}

function replaceStraightSingleQuotes(text) {
  const source = String(text);
  let output = '';
  let cursor = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "'" || (index > 0 && /[\p{L}\p{N}]/u.test(source[index - 1]))) continue;
    for (let closing = index + 1; closing < source.length; closing += 1) {
      if (source[closing] !== "'" || (closing + 1 < source.length && /[\p{L}\p{N}]/u.test(source[closing + 1]))) continue;
      if (wordCount(source.slice(index + 1, closing)) < 3) break;
      output += `${source.slice(cursor, index)}[quote]`;
      cursor = closing + 1;
      index = closing;
      break;
    }
  }
  return output + source.slice(cursor);
}

function stripQuotedPassages(text) {
  const stripped = String(text || '')
    .replace(/"[^"]*"/gu, '[quote]')
    .replace(/“[^”]*”/gu, '[quote]')
    .replace(/‘([^’]*)’/gu, (match, words) => (wordCount(words) >= 3 ? '[quote]' : match));
  return replaceStraightSingleQuotes(stripped);
}

function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])(?:\s+|(?=["“‘]*[A-Z]))|\n+/u)
    .map(sentence => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function isAttributedSentence(sentence) {
  return ATTRIBUTION.test(sentence)
    || TESTIMONY_ATTRIBUTION.test(sentence)
    || (CLAIM_ATTRIBUTION.test(sentence) && !CLAIM_NOUN.test(sentence));
}

function outletOwnWords(version) {
  const headline = stripQuotedPassages(version && version.headline).replace(/\s+/g, ' ').trim();
  const text = String(version && version.text || '').trim();
  const source = text || String(version && version.description || '').trim();
  const opening = sentences(stripQuotedPassages(source))
    .filter(sentence => !isAttributedSentence(sentence))
    .slice(0, 2)
    .join(' ');
  return { headline, opening };
}

function outletWords(version) {
  const { headline, opening } = outletOwnWords(version);
  return `${headline}\n${opening}`;
}

function quoteSentence(version, quote) {
  const comparable = quoteComparable(quote);
  const ownWords = outletOwnWords(version);
  for (const field of ['headline', 'opening']) {
    const found = sentences(ownWords[field]).find(sentence => quoteComparable(sentence).includes(comparable));
    if (found) return found;
  }
  return '';
}

function quoteIsInsideQuotation(sentence, quote) {
  const comparable = quoteComparable(quote);
  const text = String(sentence);
  const quoted = [
    ...[...text.matchAll(/["“][^"”]+["”]/gu)].map(match => match[0]),
    ...[...text.matchAll(/‘[^’]+’/gu)].map(match => match[0]),
    ...[...text.matchAll(/(^|[\s([{])'([^'\n]{2,})'(?=$|[\s.,;:!?)}\]])/gu)].map(match => match[2]),
  ];
  return quoted.some(rawSpan => {
    const span = quoteComparable(rawSpan);
    return span.includes(comparable) || comparable.includes(span);
  });
}

function validatedStance(version, stance, quote) {
  const sentence = quoteSentence(version, quote);
  if (!sentence) return null;
  if (quoteIsInsideQuotation(sentence, quote) || isAttributedSentence(sentence)) return null;
  if (stance !== 'plain' && LEGAL_REPORT.test(quote) && !LOADED_WORD.test(quote)) return 'plain';
  return stance;
}

function buildTold(versions, raw) {
  const cleanVersions = distinctNonRedditVersions({ outlet_versions: versions });
  const outlets = cleanVersions.map(({ name, headline, url }) => ({ name, headline, url }));
  const byName = new Map(cleanVersions.map(version => [version.name.toLocaleLowerCase('en-AU'), version]));
  const kinds = new Set(['person', 'party', 'organisation', 'cause', 'government']);
  const stances = new Set(['toward', 'against', 'plain']);
  const subjects = [];
  for (const candidate of (raw && Array.isArray(raw.subjects) ? raw.subjects : []).slice(0, 3)) {
    if (!candidate || typeof candidate.name !== 'string' || !candidate.name.trim() || !kinds.has(candidate.kind)) continue;
    // A slashed name ("Minibus/Bus", "School/Education System") is the model
    // hedging between things, not one party or person a story can lean on.
    if (candidate.name.includes('/')) continue;
    const valid = [];
    const usedOutlets = new Set();
    for (const stance of (Array.isArray(candidate.stances) ? candidate.stances : [])) {
      if (!stance || !stances.has(stance.stance)) continue;
      const version = byName.get(String(stance.outlet || '').trim().toLocaleLowerCase('en-AU'));
      if (!version || usedOutlets.has(version.name)) continue;
      const hasQuote = typeof stance.quote === 'string' && stance.quote.trim().length > 0;
      if (stance.stance === 'plain' && !hasQuote) {
        usedOutlets.add(version.name);
        valid.push({ outlet: version.name, stance: 'plain', quote: '' });
        continue;
      }
      if (!hasQuote) continue;
      const quote = stance.quote.trim();
      const quoteWords = quote.match(/\S+/g) || [];
      if (quoteWords.length > 12) continue;
      const comparableQuote = quoteComparable(quote);
      if (!comparableQuote || !quoteComparable(outletWords(version)).includes(comparableQuote)) continue;
      const cleanStance = validatedStance(version, stance.stance, quote);
      if (!cleanStance) continue;
      usedOutlets.add(version.name);
      valid.push({ outlet: version.name, stance: cleanStance, quote });
    }
    if (valid.length >= 2 && valid.some(stance => stance.stance !== 'plain')) {
      subjects.push({ name: candidate.name.trim(), kind: candidate.kind, stances: valid });
    }
  }
  if (subjects.length === 0) return { outlets };
  return {
    outlets,
    subjects,
    differs: subjects.some(subject => new Set(subject.stances.map(stance => stance.stance)).size > 1),
  };
}

function toldUserPrompt(story, versions) {
  const lines = [`STORY: ${story.headline || story.title || ''}`];
  versions.forEach((version, index) => {
    const { headline, opening } = outletOwnWords(version);
    lines.push(`\nOUTLET ${index + 1}: ${version.name}`);
    lines.push(`HEADLINE: ${headline}`);
    lines.push(`OPENING: ${opening}`);
  });
  return lines.join('\n');
}

async function addToldToStories(stories, toldWriter, fallbackWriter, log) {
  // Preserve the former (stories, writer, log) call shape for callers that do
  // not supply a fallback writer.
  if (!log && fallbackWriter && typeof fallbackWriter.warn === 'function'
      && typeof fallbackWriter.tell !== 'function') {
    log = fallbackWriter;
    fallbackWriter = null;
  }
  const eligible = stories.map(story => ({ story, versions: distinctNonRedditVersions(story) }))
    .filter(entry => entry.versions.length >= 2);
  let cursor = 0;
  async function worker() {
    while (true) {
      const entry = eligible[cursor++];
      if (!entry) return;
      const { story, versions } = entry;
      try {
        const response = await toldWriter.tell(TOLD_SYSTEM_PROMPT, toldUserPrompt(story, versions), TOLD_SCHEMA);
        story.told = buildTold(versions, response && response.json);
      } catch (error) {
        const title = story.title || story.headline || 'untitled story';
        if (!fallbackWriter || typeof fallbackWriter.tell !== 'function') {
          story.told = buildTold(versions, null);
          if (log && log.warn) log.warn('pipeline:writer', `How-it-was-told call failed for "${title}", using outlets only: ${error.message}`);
          continue;
        }
        if (log && log.warn) log.warn('pipeline:writer', `How-it-was-told call failed for "${title}", retrying with writer model: ${error.message}`);
        try {
          const response = await fallbackWriter.tell(TOLD_SYSTEM_PROMPT, toldUserPrompt(story, versions), TOLD_SCHEMA);
          story.told = buildTold(versions, response && response.json);
        } catch (fallbackError) {
          story.told = buildTold(versions, null);
          if (log && log.warn) log.warn('pipeline:writer', `How-it-was-told writer fallback failed for "${title}", using outlets only: ${fallbackError.message}`);
        }
      }
    }
  }
  const concurrency = Math.min(4, Math.max(1, Number(toldWriter.concurrency) || 1), Math.max(1, eligible.length));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return stories;
}

module.exports = {
  TOLD_SYSTEM_PROMPT,
  TOLD_SCHEMA,
  distinctNonRedditVersions,
  outletOwnWords,
  buildTold,
  toldUserPrompt,
  addToldToStories,
};
