'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { guardFacts } = require('../src/pipeline/writer/facts');

const source = {
  title: "Breaking Bad star Bryan Cranston in 'deep despair' over onscreen son's death",
  merged_descriptions: ['RJ Mitte died suddenly. An investigation is ongoing.'],
  article_content: 'Bryan Cranston paid tribute to his onscreen son.',
  top_comments: ['This is terribly sad.'],
};

function written(overrides = {}) {
  return {
    headline: 'Bryan Cranston mourns RJ Mitte',
    summary: 'Bryan Cranston paid tribute to RJ Mitte.',
    detail: 'Bryan Cranston paid tribute to his former co-star. Friends and colleagues shared memories of the actor and his work.',
    ...overrides,
  };
}

it('removes the invented Mitte suicide sentence and flags its unsupported number', () => {
  assert.deepStrictEqual(guardFacts(written({
    detail: 'RJ Mitte, who played his onscreen son, died by suicide at 34 in Texas. Bryan Cranston paid tribute to his former co-star and colleagues shared memories of the actor and his work.',
  }), source), {
    value: written({
      detail: 'Bryan Cranston paid tribute to his former co-star and colleagues shared memories of the actor and his work. RJ Mitte died suddenly. An investigation is ongoing.',
    }),
    problems: ['removed unsupported claim: "suicid"', 'unsupported number: 34'],
    facts_removed: 1,
    numbers_unsupported: 1,
  });
});

it('keeps the Mitte sentence when the source states suicide', () => {
  const value = written({
    detail: 'RJ Mitte, who played his onscreen son, died by suicide. Bryan Cranston paid tribute to his former co-star and colleagues shared memories of the actor and his work.',
  });
  assert.deepStrictEqual(guardFacts(value, {
    ...source,
    article_content: 'The family said RJ Mitte died by suicide.',
  }), {
    value,
    problems: [],
    facts_removed: 0,
    numbers_unsupported: 0,
  });
});

it('keeps a sensitive term when its stem occurs in the source', () => {
  const value = written({ detail: 'Police said a man was charged with an offence. The case will return to court after investigators filed their evidence and prepared for the next hearing.' });
  assert.deepStrictEqual(guardFacts(value, {
    ...source,
    merged_descriptions: ['A man was charged with an offence.'],
  }), {
    value,
    problems: [],
    facts_removed: 0,
    numbers_unsupported: 0,
  });
});

it('keeps a suicide claim supported by a report that he took his own life', () => {
  const value = written({ detail: 'A publicist confirmed that Mitte died by suicide. Bryan Cranston paid tribute to his former co-star and colleagues shared memories of the actor and his work.' });
  assert.deepStrictEqual(guardFacts(value, {
    ...source,
    article_content: 'A publicist confirmed news reports that Mitte took his own life.',
  }), {
    value,
    problems: [],
    facts_removed: 0,
    numbers_unsupported: 0,
  });
});

it('keeps a conviction claim supported by a murder conviction', () => {
  const value = written({ detail: 'He was convicted of murder. The case will return to court after investigators filed their evidence and prepared for the next hearing.' });
  assert.deepStrictEqual(guardFacts(value, {
    ...source,
    article_content: 'He appeals his murder conviction.',
  }), {
    value,
    problems: [],
    facts_removed: 0,
    numbers_unsupported: 0,
  });
});

it('keeps a killing claim supported by a reference to a killer', () => {
  const value = written({ detail: 'The man was killed. The case will return to court after investigators filed their evidence and prepared for the next hearing.' });
  assert.deepStrictEqual(guardFacts(value, {
    ...source,
    article_content: 'Police are searching for the killer.',
  }), {
    value,
    problems: [],
    facts_removed: 0,
    numbers_unsupported: 0,
  });
});

it('removes a suicide claim when the source reports only a sudden death under investigation', () => {
  assert.deepStrictEqual(guardFacts(written({ summary: 'He died by suicide.' }), {
    ...source,
    merged_descriptions: ['His sudden death is under investigation.'],
  }), {
    value: written({ summary: 'His sudden death is under investigation.' }),
    problems: ['removed unsupported claim: "suicid"'],
    facts_removed: 1,
    numbers_unsupported: 0,
  });
});

it('keeps a charge claim supported by charges in the source', () => {
  const value = written({ detail: 'He was charged. The case will return to court after investigators filed their evidence and prepared for the next hearing.' });
  assert.deepStrictEqual(guardFacts(value, {
    ...source,
    article_content: 'He faces charges.',
  }), {
    value,
    problems: [],
    facts_removed: 0,
    numbers_unsupported: 0,
  });
});

it('replaces a fully removed summary with the first teaser sentence', () => {
  assert.deepStrictEqual(guardFacts(written({ summary: 'RJ Mitte died by suicide.' }), source), {
    value: written({ summary: 'RJ Mitte died suddenly.' }),
    problems: ['removed unsupported claim: "suicid"'],
    facts_removed: 1,
    numbers_unsupported: 0,
  });
});

it('flags absent numbers but accepts the same normalised number from the source', () => {
  assert.deepStrictEqual(guardFacts(written({
    headline: 'Actor dies at 34',
    summary: 'The fundraiser collected $1.9 million.',
  }), {
    ...source,
    article_content: 'The fundraiser collected $1.9 million.',
  }), {
    value: written({ headline: 'Actor dies at 34', summary: 'The fundraiser collected $1.9 million.' }),
    problems: ['unsupported number: 34'],
    facts_removed: 0,
    numbers_unsupported: 1,
  });
});

it('does not flag 34 when it is present in the source', () => {
  const value = written({ headline: 'Actor dies at 34' });
  assert.deepStrictEqual(guardFacts(value, {
    ...source,
    article_content: 'The actor was 34.',
  }), {
    value,
    problems: [],
    facts_removed: 0,
    numbers_unsupported: 0,
  });
});

it('does not treat "stable" as a stabbing claim', () => {
  const value = written({ detail: 'Bryan Cranston paid tribute to his former co-star. His condition had been stable for years, friends and colleagues said.' });
  assert.deepStrictEqual(guardFacts(value, source), {
    value,
    problems: [],
    facts_removed: 0,
    numbers_unsupported: 0,
  });
});

it('still removes an unsupported stabbing claim', () => {
  assert.deepStrictEqual(guardFacts(written({ summary: 'He was stabbed.' }), source), {
    value: written({ summary: 'RJ Mitte died suddenly.' }),
    problems: ['removed unsupported claim: "stabb"'],
    facts_removed: 1,
    numbers_unsupported: 0,
  });
});

it('strictly flags an abbreviated numeric unit absent from the source', () => {
  assert.deepStrictEqual(guardFacts(written({ summary: 'The fundraiser collected $1.9m.' }), {
    ...source,
    article_content: 'The fundraiser collected $1.9 million.',
  }), {
    value: written({ summary: 'The fundraiser collected $1.9m.' }),
    problems: ['unsupported number: $1.9m'],
    facts_removed: 0,
    numbers_unsupported: 1,
  });
});
