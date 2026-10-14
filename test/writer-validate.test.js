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

it('applies the facts guard after parsing a valid writer result', () => {
  assert.deepStrictEqual(validateWrite({
    is_news: true,
    headline: 'Actor dies at 34',
    summary: 'The death remains under investigation.',
    detail: 'RJ Mitte died by suicide at 34 in Texas. The death remains under investigation and colleagues shared their memories of his work.',
    kicker: 'Tribute',
    section: 'world',
  }, {
    ...item,
    merged_descriptions: ['RJ Mitte died suddenly. An investigation is ongoing.'],
  }), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Actor dies at 34',
      summary: 'The death remains under investigation.',
      detail: 'The death remains under investigation and colleagues shared their memories of his work. RJ Mitte died suddenly. An investigation is ongoing.',
      kicker: 'Tribute',
      section: 'world',
    },
    problems: ['removed unsupported claim: "suicid"', 'unsupported number: 34', 'unsupported number: 34'],
    facts_removed: 1,
    numbers_unsupported: 2,
  });
});

it('replaces a section-name kicker with the first interest label', () => {
  assert.deepStrictEqual(validateWrite({
    is_news: true,
    headline: 'Clear headline',
    summary: 'A clear summary.',
    detail: 'Useful detail.',
    kicker: 'Homelab & Self-hosting news',
    section: 'homelab',
  }, item), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Clear headline',
      summary: 'A clear summary.',
      detail: 'Useful detail.',
      kicker: 'Plex',
      section: 'homelab',
    },
    problems: ['Kicker repeated the section name'],
  });
});

it('repairs an overlong kicker without discarding the model writing', () => {
  assert.deepStrictEqual(validateWrite({
    is_news: true,
    headline: 'Model headline',
    summary: 'Model summary.',
    detail: 'Model detail.',
    kicker: 'A much too long model kicker.',
    section: 'homelab',
  }, item), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Model headline',
      summary: 'Model summary.',
      detail: 'Model detail.',
      kicker: 'Plex',
      section: 'homelab',
    },
    problems: ['Kicker exceeded three words or 24 characters'],
  });
});

it('cuts an overlong kicker to two words when no interest label is available', () => {
  assert.deepStrictEqual(validateWrite({
    is_news: true,
    headline: 'Model headline',
    summary: 'Model summary.',
    detail: 'Model detail.',
    kicker: 'A much too long model kicker...',
    section: 'world',
  }, { ...item, interest_matches: [] }), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Model headline',
      summary: 'Model summary.',
      detail: 'Model detail.',
      kicker: 'A much',
      section: 'world',
    },
    problems: ['Kicker exceeded three words or 24 characters'],
  });
});

it('repairs an unknown section without discarding the model writing', () => {
  assert.deepStrictEqual(validateWrite({
    is_news: true,
    headline: 'Model headline',
    summary: 'Model summary.',
    detail: 'Model detail.',
    kicker: 'Plex',
    section: 'space',
  }, item), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Model headline',
      summary: 'Model summary.',
      detail: 'Model detail.',
      kicker: 'Plex',
      section: 'homelab',
    },
    problems: ['Unknown section: space'],
  });
});

it('keeps a section-name kicker when no interest label is available', () => {
  assert.deepStrictEqual(validateWrite({
    is_news: true,
    headline: 'Clear headline',
    summary: 'A clear summary.',
    detail: 'Useful detail.',
    kicker: 'Around the internet news',
    section: 'internet',
  }, { ...item, interest_matches: [] }), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Clear headline',
      summary: 'A clear summary.',
      detail: 'Useful detail.',
      kicker: 'Around the internet news',
      section: 'internet',
    },
    problems: ['Kicker repeated the section name'],
  });
});

it('strips only a single sentence-ending full stop from headlines', () => {
  const result = headline => validateWrite({
    is_news: true,
    headline,
    summary: 'A clear summary.',
    detail: 'Useful detail.',
    kicker: 'Topic',
    section: 'world',
  }, item);
  assert.deepStrictEqual([
    result('Fine refused.'),
    result('Made in the U.S.'),
    result('Wait...'),
    result('Version 2.'),
  ], [
    { ok: true, value: { is_news: true, headline: 'Fine refused', summary: 'A clear summary.', detail: 'Useful detail.', kicker: 'Topic', section: 'world' }, problems: [] },
    { ok: true, value: { is_news: true, headline: 'Made in the U.S.', summary: 'A clear summary.', detail: 'Useful detail.', kicker: 'Topic', section: 'world' }, problems: [] },
    { ok: true, value: { is_news: true, headline: 'Wait...', summary: 'A clear summary.', detail: 'Useful detail.', kicker: 'Topic', section: 'world' }, problems: [] },
    { ok: true, value: { is_news: true, headline: 'Version 2', summary: 'A clear summary.', detail: 'Useful detail.', kicker: 'Topic', section: 'world' }, problems: ['unsupported number: 2'], numbers_unsupported: 1 },
  ]);
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
    [{ ...base, headline: '   ' }, ['Headline was empty']],
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

it('uses the Tasmanian gazetteer only to enforce the Tasmania section', () => {
  const written = section => ({
    is_news: true,
    headline: 'Gift shop question',
    summary: 'A visitor asks about a souvenir.',
    detail: 'A visitor asks why the gift shop does not sell a particular shirt.',
    kicker: 'Gift shop',
    section,
  });
  const local = { ...item, title: "Why isn't there a 'I busted a nut climbing The Nut' t-shirt at the giftshop?", description: '', interest_matches: [] };
  const interstate = { ...item, title: 'Housing changes proposed for Perth', description: 'The WA government announced the proposal.', interest_matches: [] };

  assert.deepStrictEqual(validateWrite(written('tasmania'), local), {
    ok: true,
    value: { ...written('tasmania'), headline: 'Gift shop question' },
    problems: [],
  });
  assert.deepStrictEqual(validateWrite(written('tasmania'), interstate), {
    ok: true,
    value: { ...written('australia'), headline: 'Gift shop question' },
    problems: ['section moved: tasmania -> australia (no Tasmanian place named)'],
    sectionMoved: true,
  });
});

it('rejects the four observed false Tasmanian place matches', () => {
  const written = {
    is_news: true,
    headline: 'Neutral headline',
    summary: 'Neutral summary.',
    detail: 'Neutral detail.',
    kicker: 'News',
    section: 'tasmania',
  };
  const falseMatches = [
    'trusting the bounce on day five is always a risky prospect',
    'a disjointed back-and-forth between prison officials',
    'go back and forth with natural, rich conversation',
    'Queensland MP Garth Hamilton',
  ];

  assert.deepStrictEqual(falseMatches.map(title => validateWrite(written, {
    ...item,
    title,
    description: '',
    interest_matches: [],
  })), falseMatches.map(() => ({
    ok: true,
    value: { ...written, section: 'australia' },
    problems: ['section moved: tasmania -> australia (no Tasmanian place named)'],
    sectionMoved: true,
  })));
});

it('enforces companion-required Tasmanian places against the whole story text', () => {
  const written = title => ({
    is_news: true,
    headline: title,
    summary: 'A local update.',
    detail: 'More details are available.',
    kicker: 'Local update',
    section: 'tasmania',
  });
  const cases = [
    ['Garth Hamilton', 'Garth Hamilton', 'australia', true],
    ["Hamilton, in Tasmania's Central Highlands", 'Hamilton update', 'tasmania', false],
    ['Stanley', 'Stanley update', 'australia', true],
    ['The Nut at Stanley', 'Stanley landmark update', 'tasmania', false],
  ];

  assert.deepStrictEqual(cases.map(([title, headline]) => validateWrite(written(headline), {
    ...item,
    title,
    description: '',
    interest_matches: [],
  })), cases.map(([, headline, section, moved]) => ({
    ok: true,
    value: { ...written(headline), section },
    problems: moved ? ['section moved: tasmania -> australia (no Tasmanian place named)'] : [],
    ...(moved ? { sectionMoved: true } : {}),
  })));
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

it('qualifies top stories only at three-outlet coverage or with an interest match', () => {
  const candidates = [
    { id: 'coverage-two', section: 'world', coverage: 2, interest_matches: [], rank: 1 },
    { id: 'reader-interest', section: 'tasmania', coverage: 1, interest_matches: [{ weight: 1 }], rank: 2 },
  ];
  assert.deepStrictEqual(deterministicEdit(candidates, { sectionSize: 2, topSize: { min: 1, max: 1 } }), {
    top: ['reader-interest'],
    sections: { tasmania: [], australia: [], world: ['coverage-two'], tech: [], homelab: [], gaming: [], internet: [] },
    more: { tasmania: [], australia: [], world: [], tech: [], homelab: [], gaming: [], internet: [] },
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
    fallback: 'partial',
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
    fallback: 'partial',
    problems: ['Top list had more than 7 valid stories and was clamped'],
  });
});

it('reports a full fallback for an editor object with no usable selection', () => {
  assert.deepStrictEqual(validateEdit({}, stories(), { sectionSize: 2, topSize: { min: 5, max: 7 } }), {
    ...deterministicEdit(stories(), { sectionSize: 2, topSize: { min: 5, max: 7 } }),
    fallback: 'full',
    problems: ['Editor output was not valid JSON'],
  });
});

it('reports a partial fallback when one editor id is invalid', () => {
  assert.deepStrictEqual(validateEdit({
    top: ['s1', 's2', 's3', 's4', 'missing'],
    sections: { world: ['s5', 's6'] },
  }, stories(), { sectionSize: 2, topSize: { min: 5, max: 7 } }), {
    top: ['s1', 's2', 's3', 's4', 's5'],
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], internet: [] },
    fallback: 'partial',
    problems: [
      'Unknown top story id: missing',
      'Top list had fewer than 5 valid stories and was filled',
      'Story s5 was already selected for top',
    ],
  });
});

it('reports no fallback for a clean editor selection', () => {
  assert.deepStrictEqual(validateEdit({
    top: ['s1', 's2', 's3', 's4', 's5'],
    sections: { world: ['s6', 's7'] },
  }, stories(), { sectionSize: 2, topSize: { min: 5, max: 7 } }), {
    top: ['s1', 's2', 's3', 's4', 's5'],
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], internet: [] },
    fallback: 'none',
    problems: [],
  });
});

const geographyItem = { title: 'A local update', description: 'Residents discuss the changes.', interest_matches: [] };
const geographyValue = (headline, summary = 'Residents discuss the changes.', section = 'world') => ({ is_news: true, headline, summary, detail: 'Residents discuss the changes.', kicker: 'Update', section });
const geographyResult = (value, section) => ({ ok: true, value: { ...value, section }, problems: value.section === section ? [] : [`section moved: world -> ${section} (Australian place named; no overseas place named)`], ...(value.section === section ? {} : { sectionMoved: true }) });

it('moves Australian states, territories and major cities out of world using whole capitalised names', () => {
  const names = ['New South Wales', 'Victoria', 'Queensland', 'South Australia', 'Western Australia', 'Northern Territory', 'Australian Capital Territory', 'NSW', 'Vic', 'Qld', 'SA', 'WA', 'NT', 'ACT', 'Sydney', 'Melbourne', 'Brisbane', 'Adelaide', 'Canberra', 'Alice Springs', 'Gold Coast', 'Sunshine Coast', 'Wollongong', 'Geelong', 'Cairns', 'Townsville'];
  const values = names.map(name => geographyValue(`Residents meet in ${name}`));
  assert.deepStrictEqual(values.map(value => validateWrite(value, geographyItem)), values.map(value => geographyResult(value, 'australia')));
  const lower = ['nsw', 'vic', 'qld', 'Sa', 'Wa', 'nt', 'act', 'tas', 'was', 'SAIL', 'Tasman', 'sydney', 'queensland', 'éNTé'];
  const unchanged = lower.map(name => geographyValue(`Residents discuss ${name}`));
  assert.deepStrictEqual(unchanged.map(value => validateWrite(value, geographyItem)), unchanged.map(value => geographyResult(value, 'world')));
});

it('uses written headline and summary for Australian evidence and reuses the Tasmania acceptance rule', () => {
  const cases = [
    [geographyValue('Storms damage local businesses', 'Severe storms hit the Northern Territory.'), geographyItem, 'australia'],
    ...['Tasmania', 'Tas', 'Hobart', 'Launceston'].map(name => [geographyValue(`Residents meet in ${name}`), geographyItem, 'tasmania']),
    [geographyValue('Residents discuss new services', 'Hobart residents discuss the changes.'), { ...geographyItem, title: 'Hobart residents discuss new services' }, 'tasmania'],
    // Summary alone does not extend the existing Tasmania evidence rule.
    [geographyValue('Residents discuss new services', 'Hobart residents discuss the changes.'), geographyItem, 'australia'],
    [geographyValue('Residents discuss new services'), { ...geographyItem, title: 'Sydney residents meet' }, 'world'],
    [{ ...geographyValue('Residents discuss new services'), detail: 'Residents meet in Sydney.' }, geographyItem, 'world'],
    [geographyValue('Sydney technology firm announces updates', undefined, 'tech'), geographyItem, 'tech'],
  ];
  assert.deepStrictEqual(cases.map(([value, source]) => validateWrite(value, source)), cases.map(([value, , section]) => geographyResult(value, section)));
});

it('keeps international stories and disambiguates shared Australian place names', () => {
  const cases = [
    ['Perth residents meet in WA', 'australia'], ['Newcastle residents meet in NSW', 'australia'],
    ['Richmond residents meet in Victoria', 'australia'], ['Darwin residents meet in NT', 'australia'],
    ['Perth residents meet in Scotland', 'world'], ['Newcastle residents meet in UK', 'world'],
    ['Coventry crush Newcastle', 'world'], ['Richmond residents meet', 'world'],
    ['Charles Darwin papers go on display', 'world'], ['Darwin Nunez joins a new club', 'world'],
    ['Perth residents meet', 'world'], ['Newcastle residents meet', 'world'],
    ...['Japan', 'Japanese', 'China', 'Chinese', 'France', 'French', 'United States', 'American', 'US', 'USA', 'U.S.', 'UK', 'British', 'New Zealand', 'Kiwi', 'South Africa', 'South African', 'South Africans', 'London', 'Paris', 'New York', 'Tokyo', 'Auckland', 'Singapore', 'Dubai', 'Hong Kong', 'Coventry'].map(name => [`Sydney delegation visits ${name}`, 'world']),
  ];
  const values = cases.map(([headline]) => geographyValue(headline));
  assert.deepStrictEqual(values.map(value => validateWrite(value, geographyItem)), values.map((value, index) => geographyResult(value, cases[index][1])));
  const summary = geographyValue('Sydney delegation departs for talks', 'The delegation will meet Japanese officials.');
  assert.deepStrictEqual(validateWrite(summary, geographyItem), geographyResult(summary, 'world'));
});
