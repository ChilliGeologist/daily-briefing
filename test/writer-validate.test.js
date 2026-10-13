'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { validateWrite, validateEdit, deterministicEdit, defaultSection } = require('../src/pipeline/writer/validate');

const item = {
  title: 'Publisher headline',
  description: 'First teaser sentence. Second teaser sentence.',
  source_name: 'The Outlet',
  interest_matches: [{ label: 'Plex', kind: 'product', weight: 2, urgent: true, term: 'Plex' }],
};

it('parses and trims a valid writer result', () => {
  assert.deepStrictEqual(validateWrite(JSON.stringify({
    is_news: true,
    headline: '  Clear headline  ',
    summary: '  A clear summary. ',
    detail: '  Useful detail. ',
    kicker: '  Plex ',
    section: 'homelab',
  }), item), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Clear headline',
      summary: 'A clear summary.',
      detail: 'Useful detail.',
      kicker: 'Plex',
      section: 'homelab',
    },
    problems: [],
  });
});

it('cuts an overlong detail at its last safe sentence and notes it', () => {
  const first = `${Array(150).fill('word').join(' ')}.`;
  const detail = `${first} ${Array(20).fill('extra').join(' ')}`;
  assert.deepStrictEqual(validateWrite({
    is_news: true,
    headline: 'Headline',
    summary: 'Summary.',
    detail,
    kicker: 'Topic',
    section: 'world',
  }, item), {
    ok: true,
    value: { is_news: true, headline: 'Headline', summary: 'Summary.', detail: first, kicker: 'Topic', section: 'world' },
    problems: ['Detail exceeded 160 words and was shortened'],
  });
});

it('falls back for every junk writer shape without throwing', () => {
  const expected = {
    ok: false,
    value: {
      is_news: true,
      headline: 'Publisher headline',
      summary: 'First teaser sentence.',
      detail: 'First teaser sentence. Second teaser sentence.',
      kicker: 'Plex',
      section: 'homelab',
    },
  };
  const base = { is_news: true, headline: 'H', summary: 'S', detail: 'D', kicker: 'K', section: 'world' };
  const cases = [
    ['not json', ['Writer output was not valid JSON']],
    [{ ...base, section: 'space' }, ['Unknown section: space']],
    [{ ...base, headline: '   ' }, ['Headline was empty']],
    [{ ...base, detail: Array.from({ length: 40 }, () => `${Array(10).fill('word').join(' ')}.`).join(' ') }, ['Detail was 400 words or longer']],
  ];
  assert.deepStrictEqual(cases.map(([raw]) => validateWrite(raw, item)), cases.map(([, problems]) => ({ ...expected, problems })));
});

it('chooses fallback sections from section mapping data', () => {
  assert.deepStrictEqual([
    defaultSection({ interest_matches: [{ label: 'Launceston', kind: 'place' }] }),
    defaultSection({ interest_matches: [{ label: 'Home Assistant', kind: 'product' }] }),
    defaultSection({ interest_matches: [{ label: 'Dota 2', kind: 'product' }] }),
    defaultSection({ interest_matches: [{ label: 'Interest rates', kind: 'product' }] }),
  ], ['tasmania', 'homelab', 'gaming', 'australia']);
});

function stories() {
  return [
    { id: 's1', section: 'world', coverage: 4, interest_matches: [], rank: 1 },
    { id: 's2', section: 'tasmania', coverage: 1, interest_matches: [{ weight: 3 }], rank: 2 },
    { id: 's3', section: 'world', coverage: 1, interest_matches: [], rank: 3 },
    { id: 's4', section: 'world', coverage: 1, interest_matches: [], rank: 4 },
    { id: 's5', section: 'world', coverage: 1, interest_matches: [], rank: 5 },
    { id: 's6', section: 'world', coverage: 1, interest_matches: [], rank: 6 },
    { id: 's7', section: 'world', coverage: 1, interest_matches: [], rank: 7 },
    { id: 's8', section: 'world', coverage: 1, interest_matches: [], rank: 8 },
  ];
}

it('builds a deterministic top, sections and more without losing stories', () => {
  assert.deepStrictEqual(deterministicEdit(stories(), { sectionSize: 2, topSize: { min: 5, max: 7 } }), {
    top: ['s1', 's2', 's3', 's4', 's5'],
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], internet: [] },
  });
});

it('drops invalid and duplicate editor ids, clamps top, and fills deterministically', () => {
  assert.deepStrictEqual(validateEdit({
    top: ['missing', 's2', 's2'],
    sections: { world: ['s1', 's3', 's3', 'missing'] },
  }, stories(), { sectionSize: 2, topSize: { min: 5, max: 7 } }), {
    top: ['s2', 's1', 's3', 's4', 's5'],
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], internet: [] },
    problems: [
      'Unknown top story id: missing',
      'Duplicate top story id: s2',
      'Top list had fewer than 5 valid stories and was filled',
      'Story s1 was already selected for top',
      'Story s3 was already selected for top',
      'Duplicate section story id: s3',
      'Unknown section story id: missing',
    ],
  });
});

it('clamps twelve valid editor top picks to the configured maximum', () => {
  const many = stories().concat([
    { id: 's9', section: 'tech', coverage: 1, interest_matches: [], rank: 9 },
    { id: 's10', section: 'tech', coverage: 1, interest_matches: [], rank: 10 },
    { id: 's11', section: 'tech', coverage: 1, interest_matches: [], rank: 11 },
    { id: 's12', section: 'tech', coverage: 1, interest_matches: [], rank: 12 },
  ]);
  assert.deepStrictEqual(validateEdit({
    top: many.map(story => story.id),
    sections: {},
  }, many, { sectionSize: 2, topSize: { min: 5, max: 7 } }), {
    top: ['s1', 's2', 's3', 's4', 's5', 's6', 's7'],
    sections: { tasmania: [], australia: [], world: ['s8'], tech: ['s9', 's10'], homelab: [], gaming: [], internet: [] },
    more: { tasmania: [], australia: [], world: [], tech: ['s11', 's12'], homelab: [], gaming: [], internet: [] },
    problems: ['Top list had more than 7 valid stories and was clamped'],
  });
});
