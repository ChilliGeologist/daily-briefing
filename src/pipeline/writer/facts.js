'use strict';

function sensitiveGroup(claim, support = []) {
  return Object.freeze({
    claim: Object.freeze([...claim]),
    support: Object.freeze([...new Set([...claim, ...support])]),
  });
}

const SENSITIVE_TERMS = Object.freeze([
  sensitiveGroup(['suicid', 'own life', 'killed himself', 'killed herself', 'killed themselves']),
  sensitiveGroup(['convict']),
  sensitiveGroup(['kill']),
  sensitiveGroup(['murder']),
  sensitiveGroup(['charg']),
  sensitiveGroup(['arrest']),
  sensitiveGroup(['plead']),
  sensitiveGroup(['guilt']),
  sensitiveGroup(['overdos']),
  sensitiveGroup(['abus']),
  sensitiveGroup(['assault']),
  sensitiveGroup(['rape']),
  // 'stab' alone would match stable/stability.
  sensitiveGroup(['stabb', 'stab wound', 'stabs']),
  sensitiveGroup(['shoot', 'shot']),
  sensitiveGroup(['fraud']),
  sensitiveGroup(['terror']),
  sensitiveGroup(['cancer']),
  sensitiveGroup(['dementia']),
  sensitiveGroup(['stroke']),
  sensitiveGroup(['heart attack']),
  sensitiveGroup(['HIV']),
  sensitiveGroup(['drunk', 'intoxicat']),
  sensitiveGroup(['self-harm']),
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termPattern(term) {
  return new RegExp(`\\b${escapeRegExp(term).replace(/ /g, '\\s+').replace(/-/g, '[- ]')}\\w*`, 'iu');
}

const SENSITIVE_PATTERNS = SENSITIVE_TERMS.map(({ claim, support }) => ({
  term: claim[0],
  claim: claim.map(termPattern),
  support: [...new Set([...claim, ...support])].map(termPattern),
}));

function teasers(item) {
  if (Array.isArray(item.merged_descriptions) && item.merged_descriptions.length > 0) {
    return item.merged_descriptions.filter(value => typeof value === 'string' && value.trim());
  }
  return typeof item.description === 'string' && item.description.trim() ? [item.description] : [];
}

function sourceText(item) {
  return [
    item.title,
    ...teasers(item),
    item.article_content,
    ...(Array.isArray(item.top_comments) ? item.top_comments : []),
  ].filter(value => typeof value === 'string' && value.trim()).join('\n');
}

const SENTENCE_SEGMENTER = new Intl.Segmenter('en-AU', { granularity: 'sentence' });

function sentences(text) {
  return [...SENTENCE_SEGMENTER.segment(String(text || ''))]
    .map(({ segment }) => segment.trim())
    .filter(Boolean);
}

function firstSentence(text) {
  return sentences(text)[0] || String(text || '').trim();
}

function unsupportedTerm(sentence, source) {
  return SENSITIVE_PATTERNS.find(({ claim, support }) =>
    claim.some(pattern => pattern.test(sentence)) && !support.some(pattern => pattern.test(source))
  );
}

function wordCount(text) {
  return String(text || '').trim().match(/\S+/g)?.length || 0;
}

const NUMBER_PATTERN = /\$?\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|thousand|[kmb])\b|%?)/giu;

function numbers(text) {
  return String(text || '').match(NUMBER_PATTERN) || [];
}

function normaliseNumber(number) {
  return number.toLocaleLowerCase('en-AU').replace(/[,\s$%]/g, '');
}

function guardFacts(value, item) {
  const source = sourceText(item);
  const guarded = { ...value };
  const problems = [];
  let factsRemoved = 0;
  let detailRemoved = 0;

  for (const field of ['summary', 'detail']) {
    const kept = [];
    for (const sentence of sentences(guarded[field])) {
      const unsupported = unsupportedTerm(sentence, source);
      if (unsupported) {
        factsRemoved++;
        if (field === 'detail') detailRemoved++;
        problems.push(`removed unsupported claim: "${unsupported.term}"`);
      } else {
        kept.push(sentence);
      }
    }
    guarded[field] = kept.join(' ');
  }

  const teaser = teasers(item)[0] || '';
  if (!guarded.summary) guarded.summary = firstSentence(teaser);
  if (detailRemoved > 0 && wordCount(guarded.detail) < 25 && teaser) {
    guarded.detail = [guarded.detail, teaser.trim()].filter(Boolean).join(' ');
  }

  const sourceNumbers = new Set(numbers(source).map(normaliseNumber));
  let numbersUnsupported = 0;
  for (const field of ['headline', 'summary', 'detail']) {
    for (const number of numbers(value[field])) {
      if (!sourceNumbers.has(normaliseNumber(number))) {
        numbersUnsupported++;
        problems.push(`unsupported number: ${number}`);
      }
    }
  }

  return {
    value: guarded,
    problems,
    facts_removed: factsRemoved,
    numbers_unsupported: numbersUnsupported,
  };
}

module.exports = { SENSITIVE_TERMS, guardFacts };
