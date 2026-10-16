'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const {
  validateWrite,
  validateEdit,
  deterministicEdit,
  defaultSection,
  missingTextFields,
  isCommunityHelpRequest,
  isUnansweredCommunityQuestion,
} = require('../src/pipeline/writer/validate');

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
    kicker: '  Plex ',
    section: 'homelab',
  }), item), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Clear headline',
      summary: 'A clear summary.',
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
    summary: 'RJ Mitte died by suicide at 34 in Texas. The death remains under investigation.',
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
    kicker: 'Homelab & Self-hosting news',
    section: 'homelab',
  }, item), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Clear headline',
      summary: 'A clear summary.',
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
    kicker: 'A much too long model kicker.',
    section: 'homelab',
  }, item), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Model headline',
      summary: 'Model summary.',
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
    kicker: 'A much too long model kicker...',
    section: 'world',
  }, { ...item, interest_matches: [] }), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Model headline',
      summary: 'Model summary.',
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
    kicker: 'Plex',
    section: 'space',
  }, item), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Model headline',
      summary: 'Model summary.',
      kicker: 'Plex',
      section: 'homelab',
    },
    problems: ['Unknown section: space'],
  });
});

it('blanks a section-name kicker when no interest label is available', () => {
  assert.deepStrictEqual(validateWrite({
    is_news: true,
    headline: 'Clear headline',
    summary: 'A clear summary.',
    kicker: 'Around the internet news',
    section: 'internet',
  }, { ...item, interest_matches: [] }), {
    ok: true,
    value: {
      is_news: true,
      headline: 'Clear headline',
      summary: 'A clear summary.',
      kicker: '',
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
    kicker: 'Topic',
    section: 'world',
  }, item);
  assert.deepStrictEqual([
    result('Fine refused.'),
    result('Made in the U.S.'),
    result('Wait...'),
    result('Version 2.'),
  ], [
    { ok: true, value: { is_news: true, headline: 'Fine refused', summary: 'A clear summary.', kicker: 'Topic', section: 'world' }, problems: [] },
    { ok: true, value: { is_news: true, headline: 'Made in the U.S.', summary: 'A clear summary.', kicker: 'Topic', section: 'world' }, problems: [] },
    { ok: true, value: { is_news: true, headline: 'Wait...', summary: 'A clear summary.', kicker: 'Topic', section: 'world' }, problems: [] },
    { ok: true, value: { is_news: true, headline: 'Version 2', summary: 'A clear summary.', kicker: 'Topic', section: 'world' }, problems: ['unsupported number: 2'], numbers_unsupported: 1 },
  ]);
});

it('strips leading media labels from headlines case-insensitively', () => {
  const labels = ['LISTEN', 'WATCH', 'Live', 'LIVE', 'Revealed', 'EXCLUSIVE', 'VIDEO', 'PHOTOS'];
  assert.deepStrictEqual(labels.map(label => validateWrite({
    is_news: true,
    headline: `${label}: Council approves safer crossing`,
    summary: 'The council approved a safer crossing.',
    kicker: 'Council Decision',
    section: 'tasmania',
  }, { ...item, title: 'Council approves safer crossing in Launceston' }).value), labels.map(() => ({
    is_news: true,
    headline: 'Council approves safer crossing',
    summary: 'The council approved a safer crossing.',
    kicker: 'Council decision',
    section: 'tasmania',
  })));
});

it('detects only missing-source meta writing in summaries and kickers and ignores legacy detail', () => {
  const values = [
    { summary: 'No article text was provided, so no summary can be written.', kicker: 'Jobs' },
    { summary: 'No details are available regarding the loss.', kicker: 'Sport' },
    { summary: 'Useful summary.', kicker: 'Sport' },
    { summary: 'Useful summary.', kicker: 'Sport' },
    { summary: 'Useful summary.', kicker: 'Headline mystery' },
    { summary: 'The headline suggests a concerning trend.', kicker: 'News' },
    { summary: 'The headline indicates rates will rise.', kicker: 'News' },
    { summary: 'The headline states the company has failed.', kicker: 'News' },
    { summary: 'The headline implies the talks have ended.', kicker: 'News' },
    { summary: 'No substantive news content was provided for this story.', kicker: 'News' },
    { summary: 'This article does not contain enough information to report.', kicker: 'News' },
    { summary: 'The supplied content has no account of the event.', kicker: 'News' },
    { summary: 'Police have released no details about the man.', kicker: 'News' },
    { summary: 'The article says no jobs will be cut.', kicker: 'Job cuts' },
  ];
  assert.deepStrictEqual(values.map(missingTextFields), [
    ['summary'], ['summary'], [], [], ['kicker'],
    ['summary'], ['summary'], ['summary'], ['summary'], ['summary'], ['summary'], ['summary'], [], [],
  ]);
});

it('forces patterned community help and buying requests to not-news unless engagement is high', () => {
  const catches = [
    { title: 'Hardware question' },
    { title: 'Help me pick a size of a wall-mounted rack please' },
    { title: 'Dell optiplex micro 3060', description: 'Just bought this guy. It was a good purchase?? Any advice?' },
    { title: 'Arc B60 or 9060 XT 16GB for server' },
    { title: 'CWWK W680 NAS Motherboard Power Connection Question' },
    { title: 'Always on dev server. How do I secure it?' },
    { title: 'What should I self-host next?' },
    { title: 'Is this good for a beginner?' },
  ].map(value => ({ ...value, source_type: 'reddit', source_name: 'r/homelab' }));
  const nearMisses = [
    "If a remote site's cellular drops for days, how would you get a heartbeat out? (just curious)",
    "Why aren't 12V DC UPs more common?",
    'Why do you NOT use IPv6?',
    'Found while dumpster diving. Keep, Use, Salvage or sell?',
    'My small homelab: one Proxmox host and a NAS in a 16U rack',
  ].map(title => ({ title, source_type: 'reddit', source_name: 'r/homelab' }));
  assert.deepStrictEqual([
    ...catches.map(isCommunityHelpRequest),
    ...nearMisses.map(isCommunityHelpRequest),
    isCommunityHelpRequest({ ...catches[0], score: 500, comment_count: 80 }),
  ], [true, true, true, true, true, true, true, true, false, false, false, false, false, false]);
});

it('rejects community question titles with fewer than two real replies', () => {
  const boilerplate = 'Friendly reminder that all top level comments must: start with "Answer: ". I am a bot.';
  const base = { source_type: 'reddit', source_name: 'r/OutOfTheLoop' };
  assert.deepStrictEqual([
    isUnansweredCommunityQuestion({ ...base, title: "What's the deal with an AI-generated meme character ending up in a federal lawsuit?", top_comments: [boilerplate] }),
    isUnansweredCommunityQuestion({ ...base, title: "What's going on with Jennifer Meyers?", top_comments: [boilerplate, 'Answer one.', 'Answer two.'] }),
    isUnansweredCommunityQuestion({ ...base, title: 'Honey, I shrunk the homelab', top_comments: [] }),
    isUnansweredCommunityQuestion({ title: 'Why did this happen?', source_name: 'ABC', top_comments: [] }),
  ], [true, false, false, false]);
});

it('normalises kicker case while preserving mid-sentence proper nouns and acronyms', () => {
  const raw = kicker => ({
    is_news: true,
    headline: 'Council meets Launceston AI researchers',
    summary: 'The council discussed local research.',
    kicker,
    section: 'tasmania',
  });
  assert.deepStrictEqual([
    validateWrite(raw('Security Flaw'), { ...item, title: 'Ghostscript flaw affects servers' }).value.kicker,
    validateWrite(raw('Council Launceston'), { ...item, title: 'Council meets Launceston researchers', description: 'Officials met Launceston researchers.' }).value.kicker,
    validateWrite(raw('AI Security'), item).value.kicker,
    validateWrite(raw('Mowbray Charges'), { ...item, title: 'Man charged after search in Mowbray' }).value.kicker,
  ], ['Security flaw', 'Council Launceston', 'AI security', 'Mowbray charges']);
});

it('replaces bare-place and meta kickers before applying sentence case', () => {
  const raw = kicker => ({
    is_news: true,
    headline: 'Conversion therapy petition launched',
    summary: 'A petition has been launched.',
    kicker,
    section: 'tasmania',
  });
  const source = { ...item, interest_matches: [], source_name: 'The Outlet', title: 'Conversion therapy petition launched in Tasmania' };
  assert.deepStrictEqual([
    validateWrite(raw('Tasmania'), source),
    validateWrite(raw('Northern Territory'), source),
    validateWrite(raw('Headline mystery'), source),
    validateWrite(raw('No details'), source),
  ], ['Tasmania', 'Northern Territory', 'Headline mystery', 'No details'].map(kicker => ({
    ok: true,
    value: { ...raw(''), kicker: '' },
    problems: [`Kicker was only a place or meta label: ${kicker}`],
    ...(['Headline mystery', 'No details'].includes(kicker) ? { missingTextFields: ['kicker'] } : {}),
  })));
});

it('ignores a legacy detail property in writer output', () => {
  assert.deepStrictEqual(validateWrite({
    is_news: true,
    headline: 'Headline',
    summary: 'Summary.',
    detail: 'Legacy detail.',
    kicker: 'Topic',
    section: 'world',
  }, item), {
    ok: true,
    value: { is_news: true, headline: 'Headline', summary: 'Summary.', kicker: 'Topic', section: 'world' },
    problems: [],
  });
});

it('shortens a summary over 45 words at the last safe sentence without failing the write', () => {
  const first = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.';
  const second = 'Twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine thirty thirty-one thirty-two thirty-three thirty-four thirty-five thirty-six thirty-seven thirty-eight thirty-nine forty.';
  const raw = {
    is_news: true,
    headline: 'Headline',
    summary: `${first} ${second} forty-one forty-two forty-three forty-four forty-five forty-six.`,
    kicker: 'Topic',
    section: 'world',
  };

  assert.deepStrictEqual(validateWrite(raw, item), {
    ok: true,
    value: { ...raw, summary: `${first} ${second}` },
    problems: ['Summary exceeded 45 words and was shortened'],
  });
});

it('turns the 45-word cut into a sentence boundary when an overlong summary has none', () => {
  const raw = {
    is_news: true,
    headline: 'Headline',
    summary: Array(46).fill('word').join(' '),
    kicker: 'Topic',
    section: 'world',
  };

  assert.deepStrictEqual(validateWrite(raw, item), {
    ok: true,
    value: { ...raw, summary: `${Array(45).fill('word').join(' ')}.` },
    problems: ['Summary exceeded 45 words and was shortened'],
  });
});

it('falls back for every junk writer shape without throwing', () => {
  const expected = {
    ok: false,
    value: {
      is_news: true,
      headline: 'Publisher headline',
      summary: 'First teaser sentence.',
      kicker: 'Plex',
      section: 'homelab',
    },
  };
  const base = { is_news: true, headline: 'H', summary: 'S', kicker: 'K', section: 'world' };
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
    { id: 's3', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 3 },
    { id: 's4', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 4 },
    { id: 's5', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 5 },
    { id: 's6', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 6 },
    { id: 's7', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 7 },
    { id: 's8', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 8 },
  ];
}

it('builds a deterministic top, sections and more without losing stories', () => {
  assert.deepStrictEqual(deterministicEdit(stories(), { sectionSize: 2, topSize: { min: 5, max: 7 } }), {
    top: ['s1', 's2', 's3', 's4', 's5'],
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
  });
});

it('qualifies top stories only at three-outlet coverage or with an interest match', () => {
  const candidates = [
    { id: 'coverage-two', section: 'world', coverage: 2, interest_matches: [], rank: 1 },
    { id: 'reader-interest', section: 'tasmania', coverage: 1, interest_matches: [{ weight: 1 }], rank: 2 },
  ];
  assert.deepStrictEqual(deterministicEdit(candidates, { sectionSize: 2, topSize: { min: 1, max: 1 } }), {
    top: ['coverage-two'],
    sections: { tasmania: ['reader-interest'], australia: [], world: [], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    more: { tasmania: [], australia: [], world: [], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
  });
});

it('drops invalid and duplicate editor ids, clamps top, and fills deterministically', () => {
  assert.deepStrictEqual(validateEdit({
    top: ['missing', 's2', 's2'],
    sections: { world: ['s1', 's3', 's3', 'missing'] },
  }, stories(), { sectionSize: 2, topSize: { min: 5, max: 7 } }), {
    top: ['s1', 's2', 's3', 's4', 's5'],
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
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
    sections: { tasmania: [], australia: [], world: ['s8'], tech: ['s9', 's10'], homelab: [], gaming: [], sport: [], internet: [] },
    more: { tasmania: [], australia: [], world: [], tech: ['s11', 's12'], homelab: [], gaming: [], sport: [], internet: [] },
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
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
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
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    fallback: 'none',
    problems: [],
  });
});

it('repairs community-only and over-balanced tech top picks with ranked general news', () => {
  const candidates = [
    { id: 's1', section: 'tech', coverage: 2, interest_matches: [], rank: 1, source_type: 'reddit', sources: [{ name: 'Reddit' }] },
    { id: 's2', section: 'tech', coverage: 2, interest_matches: [], rank: 2, sources: [{ name: 'ABC News' }] },
    { id: 's3', section: 'homelab', coverage: 2, interest_matches: [], rank: 3, sources: [{ name: 'The Register' }] },
    { id: 's4', section: 'gaming', coverage: 2, interest_matches: [], rank: 4, sources: [{ name: 'GamesIndustry.biz' }] },
    { id: 's5', section: 'world', coverage: 2, interest_matches: [], rank: 5, sources: [{ name: 'Reuters' }] },
    { id: 's6', section: 'tasmania', coverage: 2, interest_matches: [], rank: 6, sources: [{ name: 'ABC Tasmania' }] },
    { id: 's7', section: 'australia', coverage: 2, interest_matches: [], rank: 7, sources: [{ name: 'Guardian Australia' }] },
    { id: 's8', section: 'internet', coverage: 2, interest_matches: [], rank: 8, sources: [{ name: 'Wired' }] },
  ];
  assert.deepStrictEqual(validateEdit({
    top: ['s1', 's2', 's3', 's4', 's5'],
    sections: {},
  }, candidates, { sectionSize: 2, topSize: { min: 5, max: 7 } }), {
    top: ['s2', 's3', 's5', 's6', 's7'],
    sections: { tasmania: [], australia: [], world: [], tech: ['s1'], homelab: [], gaming: ['s4'], sport: [], internet: ['s8'] },
    more: { tasmania: [], australia: [], world: [], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    fallback: 'partial',
    problems: [
      'Top story s1 was replaced by s6 (community-only source)',
      'Top story s4 was replaced by s7 (more than two tech/community sections)',
    ],
    topReplacements: [
      { removed: 's1', added: 's6', reason: 'community-only source' },
      { removed: 's4', added: 's7', reason: 'more than two tech/community sections' },
    ],
  });
});

const geographyItem = { title: 'A local update', description: 'Residents discuss the changes.', interest_matches: [] };
const geographyValue = (headline, summary = 'Residents discuss the changes.', section = 'world') => ({ is_news: true, headline, summary, kicker: 'Update', section });
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
    [geographyValue('Residents discuss new services', 'Hobart residents discuss the changes.'), geographyItem, 'tasmania'],
    [geographyValue('Residents discuss new services'), { ...geographyItem, title: 'Sydney residents meet' }, 'australia'],
    [geographyValue('Residents discuss new services'), { ...geographyItem, description: 'Residents meet in Sydney.' }, 'australia'],
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

it('uses the summary, kicker and source text as Australian evidence while keeping overseas evidence scoped to headline and summary', () => {
  const cases = [
    [{ ...geographyValue('Two seriously injured in Palumpa violence'), kicker: 'Northern Territory' }, geographyItem],
    [geographyValue('Communities assess storm damage'), { ...geographyItem, description: 'Businesses in Alice Springs were damaged.' }],
    [{ ...geographyValue('Sydney delegation visits Japan'), kicker: 'Trade visit' }, { ...geographyItem, article_content: 'Officials later returned to Darwin.' }],
    [{ ...geographyValue('Comedian on trial for sex offences', 'A prosecutor described the comedian to the jury.'), kicker: 'Trial begins' }, { ...geographyItem, article_content: 'The court heard evidence. ABC Tasmania, Hobart: we acknowledge the traditional owners.' }],
  ];
  assert.deepStrictEqual(cases.map(([value, source]) => validateWrite(value, source)), [
    {
      ok: true,
      value: { ...cases[0][0], kicker: '', section: 'australia' },
      problems: [
        'section moved: world -> australia (Australian place named; no overseas place named)',
        'Kicker was only a place or meta label: Northern Territory',
      ],
      sectionMoved: true,
    },
    {
      ok: true,
      value: { ...cases[1][0], section: 'australia' },
      problems: ['section moved: world -> australia (Australian place named; no overseas place named)'],
      sectionMoved: true,
    },
    { ok: true, value: cases[2][0], problems: [] },
    { ok: true, value: cases[3][0], problems: [] },
  ]);
});

it('moves clean overseas club and entertainment stories out of Australia without moving Australian sport abroad', () => {
  const values = [
    { ...geographyValue('Regulator would quit over Man City scandal', 'English football officials discussed Manchester City.', 'australia'), kicker: 'Football Scandal' },
    { ...geographyValue('Carragher goes in on Martinez and United', 'The football opinion concerns United.', 'australia'), kicker: 'Football Opinion' },
    { ...geographyValue('Metallica frontman shuns political rants', 'The band made the comments during a Las Vegas concert.', 'australia'), kicker: 'Concert Focus' },
    { ...geographyValue('Matildas defeat Haiti in France', 'The Matildas won comfortably.', 'australia'), kicker: 'World Cup' },
    { ...geographyValue('De Minaur reaches Shanghai quarterfinal', 'The Australian player advanced.', 'australia'), kicker: 'Tennis Quarterfinal' },
  ];
  assert.deepStrictEqual(values.map(value => validateWrite(value, geographyItem)), [
    {
      ok: true,
      value: { ...values[0], kicker: 'Football scandal', section: 'world' },
      problems: ['section moved: australia -> world (overseas place or club named; no Australian place named)'],
      sectionMoved: true,
    },
    {
      ok: true,
      value: { ...values[1], kicker: 'Football opinion', section: 'world' },
      problems: ['section moved: australia -> world (overseas place or club named; no Australian place named)'],
      sectionMoved: true,
    },
    {
      ok: true,
      value: { ...values[2], kicker: 'Concert focus', section: 'world' },
      problems: ['section moved: australia -> world (overseas place or club named; no Australian place named)'],
      sectionMoved: true,
    },
    { ok: true, value: { ...values[3], kicker: 'World cup' }, problems: [] },
    { ok: true, value: { ...values[4], kicker: 'Tennis quarterfinal' }, problems: [] },
  ]);
});

it('keeps stories from a gaming or homelab source out of the news sections', () => {
  const value = section => ({ is_news: true, headline: 'Australia misses out on the collector edition', summary: 'The edition is sold elsewhere.', kicker: 'Collector edition', section });
  assert.deepStrictEqual([
    validateWrite(value('world'), { ...geographyItem, default_category: 'gaming' }),
    validateWrite(value('tech'), { ...geographyItem, default_category: 'gaming' }),
    validateWrite(value('internet'), { ...geographyItem, default_category: 'gaming' }),
    validateWrite(value('australia'), { ...geographyItem, default_category: 'homelab' }),
    validateWrite(value('tech'), { ...geographyItem, default_category: 'homelab' }),
  ], [
    { ok: true, value: value('gaming'), problems: ['section moved: world -> gaming (gaming source)'], sectionMoved: true },
    { ok: true, value: value('gaming'), problems: ['section moved: tech -> gaming (gaming source)'], sectionMoved: true },
    { ok: true, value: value('gaming'), problems: ['section moved: internet -> gaming (gaming source)'], sectionMoved: true },
    { ok: true, value: value('homelab'), problems: ['section moved: australia -> homelab (homelab source)'], sectionMoved: true },
    { ok: true, value: value('tech'), problems: [] },
  ]);
});

it('moves tech-source stories out of local sections unless the summary or source text has Australian evidence', () => {
  const value = (section, headline = 'Banks offload AI data centre debt') => ({
    is_news: true,
    headline,
    summary: 'Banks are selling AI data centre debt.',
    kicker: 'AI debt',
    section,
  });
  assert.deepStrictEqual([
    validateWrite(value('australia'), { ...geographyItem, default_category: 'tech' }),
    validateWrite(value('tasmania'), { ...geographyItem, default_category: 'tech' }),
    validateWrite(value('australia', 'Sydney banks offload AI data centre debt'), { ...geographyItem, default_category: 'tech' }),
    validateWrite(value('tech'), { ...geographyItem, default_category: 'tech' }),
  ], [
    {
      ok: true,
      value: value('world'),
      problems: ['section moved: australia -> world (tech source; no Australian evidence)'],
      sectionMoved: true,
    },
    {
      ok: true,
      value: value('world'),
      problems: ['section moved: tasmania -> world (tech source; no Australian evidence)'],
      sectionMoved: true,
    },
    { ok: true, value: value('australia', 'Sydney banks offload AI data centre debt'), problems: [] },
    { ok: true, value: value('tech'), problems: [] },
  ]);
});

it('sentence-cases kickers whose only capitals are in a Title Case headline, and keeps acronyms', () => {
  const source = { ...geographyItem, title: 'Grace Hopper Celebration Cancelled', description: 'Grace Hopper Celebration Cancelled', article_content: 'The mini NAS build uses two drives.' };
  const raw = kicker => ({ is_news: true, headline: 'Grace Hopper Celebration Cancelled', summary: 'The event was cancelled.', kicker, section: 'tech' });
  assert.deepStrictEqual(['Celebration Cancelled', 'Mini Nas'].map(kicker => validateWrite(raw(kicker), source).value.kicker), ['Celebration cancelled', 'Mini NAS']);
});

it('leads a section with stories three or more outlets carried, ahead of the editor order', () => {
  const list = [
    { id: 's1', section: 'tech', coverage: 1, interest_matches: [], rank: 1 },
    { id: 's2', section: 'tech', coverage: 7, interest_matches: [], rank: 2 },
    { id: 's3', section: 'tech', coverage: 1, interest_matches: [], rank: 3 },
  ];
  assert.deepStrictEqual(validateEdit({ top: [], sections: { tech: ['s1', 's3', 's2'] } }, list, { sectionSize: 2, topSize: { min: 0, max: 7 } }).sections.tech, ['s2', 's1']);
});

it('leads a section with stories about the reader\'s products after widely covered ones', () => {
  const list = [
    { id: 's1', section: 'homelab', coverage: 1, interest_matches: [], rank: 1 },
    { id: 's2', section: 'homelab', coverage: 1, interest_matches: [{ label: 'Tailscale', kind: 'product', weight: 2 }], rank: 2 },
    { id: 's3', section: 'homelab', coverage: 1, interest_matches: [{ label: 'Unraid', kind: 'product', weight: 2 }, { label: 'Sonarr', kind: 'product', weight: 2 }], rank: 3 },
    { id: 's4', section: 'homelab', coverage: 4, interest_matches: [], rank: 4 },
    { id: 's5', section: 'homelab', coverage: 1, interest_matches: [{ label: 'Tasmania', kind: 'place', weight: 1 }], rank: 5 },
  ];
  assert.deepStrictEqual(validateEdit({ top: [], sections: { homelab: ['s1', 's5', 's2', 's3', 's4'] } }, list, { sectionSize: 4, topSize: { min: 0, max: 7 } }).sections.homelab, ['s4', 's3', 's2', 's1']);
});

it('blanks a "No story" kicker', () => {
  const raw = { is_news: true, headline: 'Everest Runner by Runner', summary: 'A feature.', kicker: 'No story', section: 'australia' };
  assert.strictEqual(validateWrite(raw, { ...geographyItem, interest_matches: [] }).value.kicker, '');
});

it('does not lift a Reddit-only post about a product in a news section', () => {
  const list = [
    { id: 's1', section: 'australia', coverage: 1, interest_matches: [], rank: 1, sources: [{ name: 'ABC News Australia' }] },
    { id: 's2', section: 'australia', coverage: 1, interest_matches: [{ label: 'Coles', kind: 'product', weight: 2 }], rank: 2, sources: [{ name: 'r/popular' }] },
    { id: 's3', section: 'australia', coverage: 1, interest_matches: [{ label: 'Woolworths', kind: 'product', weight: 2 }], rank: 3, sources: [{ name: 'ABC News Australia' }] },
  ];
  assert.deepStrictEqual(validateEdit({ top: [], sections: { australia: ['s1', 's2', 's3'] } }, list, { sectionSize: 3, topSize: { min: 0, max: 7 } }).sections.australia, ['s3', 's1', 's2']);
});

it('keeps a single-source internet-culture story in Around the internet, but not one other outlets carried', () => {
  const value = section => ({ is_news: true, headline: 'What is going on with the new Narnia movie', summary: 'Fans are debating the casting.', kicker: 'Film casting', section });
  assert.deepStrictEqual([
    validateWrite(value('australia'), { ...geographyItem, default_category: 'trending', coverage: 1 }),
    validateWrite(value('australia'), { ...geographyItem, default_category: 'trending', coverage: 3 }),
  ], [
    { ok: true, value: value('internet'), problems: ['section moved: australia -> internet (trending source)'], sectionMoved: true },
    { ok: true, value: value('australia'), problems: [] },
  ]);
});

it('never repairs a long kicker into a bare place name', () => {
  const source = { ...geographyItem, interest_matches: [{ label: 'Tasmania', kind: 'place', weight: 1 }, { label: 'State politics', kind: 'topic', weight: 2 }] };
  const raw = { is_news: true, headline: 'Firmus IPO flops but the premier still sees opportunity', summary: 'The premier remains confident.', kicker: 'Premier backs data centre plans', section: 'tasmania' };
  assert.strictEqual(validateWrite(raw, source).value.kicker, 'State politics');
});

it('treats a summary that describes a paywall page as missing text', () => {
  assert.deepStrictEqual([
    'The provided text is not a genuine news story and appears to be a paywall or subscription prompt.',
    'The provided text is a paywalled article with no accessible story content.',
    'The supplied page is a paywalled story with no accessible article content.',
    'There is no accessible source content.',
    'Officials said the claims were not a genuine threat.',
    'RuneLite announced that plugins with paywalled functionality are no longer allowed.',
  ].map(summary => missingTextFields({ summary })), [
    ['summary'], ['summary'], ['summary'], ['summary'], [], [],
  ]);
  assert.deepStrictEqual(missingTextFields({ kicker: 'Subscription wall' }), ['kicker']);
});

it('moves world and tech source stories out of local sections only without Australian evidence', () => {
  const value = (section, headline, summary = `${headline}.`) => ({
    is_news: true,
    headline,
    summary,
    kicker: 'Court case',
    section,
  });
  const cases = [
    [value('australia', 'Ex-fiance of Nancy Mace charged with sex crimes'), 'world', 'world'],
    [value('tasmania', "Why Zelensky's meeting with Burnham matters"), 'world', 'world'],
    [value('australia', 'Cloud provider changes its pricing'), 'tech', 'world'],
    [value('tech', 'Cloud provider changes its pricing'), 'tech', 'tech'],
    [value('australia', 'Sydney cloud provider changes its pricing'), 'world', 'australia'],
  ];
  assert.deepStrictEqual(cases.map(([written, category]) => validateWrite(written, {
    ...geographyItem,
    title: written.headline,
    description: written.summary,
    default_category: category,
  })), cases.map(([written, category, section]) => ({
    ok: true,
    value: { ...written, section },
    problems: written.section === section ? [] : [
      `section moved: ${written.section} -> world (${category} source; no Australian evidence)`,
    ],
    ...(written.section === section ? {} : { sectionMoved: true }),
  })));
});

it('replaces a single-outlet top story without an interest by widest-covered remaining news', () => {
  const candidates = [
    { id: 'fine', section: 'australia', coverage: 1, interest_matches: [], rank: 1, sources: [{ name: 'ABC' }] },
    { id: 'local', section: 'tasmania', coverage: 1, interest_matches: [], rank: 2, sources: [{ name: 'Police' }, { name: 'Local paper' }] },
    { id: 'interest', section: 'world', coverage: 1, interest_matches: [{ label: 'Federal politics' }], rank: 3, sources: [{ name: 'BBC' }] },
    { id: 'policy', section: 'australia', coverage: 2, interest_matches: [], rank: 4, sources: [{ name: 'ABC' }, { name: 'Guardian' }] },
    { id: 'security', section: 'tech', coverage: 2, interest_matches: [], rank: 5, sources: [{ name: 'Wired' }, { name: 'Register' }] },
    { id: 'pope', section: 'world', coverage: 4, interest_matches: [], rank: 6, sources: [{ name: 'BBC' }, { name: 'Guardian' }] },
    { id: 'starlink', section: 'world', coverage: 5, interest_matches: [], rank: 7, sources: [{ name: 'BBC' }, { name: 'SMH' }] },
    { id: 'brand', section: 'world', coverage: 3, interest_matches: [], rank: 8, sources: [{ name: 'ABC' }, { name: 'Guardian' }] },
  ];
  assert.deepStrictEqual(validateEdit({
    top: ['fine', 'local', 'interest', 'policy', 'security'],
    sections: {},
  }, candidates, { sectionSize: 2, topSize: { min: 5, max: 7 } }), {
    top: ['starlink', 'local', 'interest', 'policy', 'security'],
    sections: { tasmania: [], australia: ['fine'], world: ['pope', 'brand'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    more: { tasmania: [], australia: [], world: [], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    fallback: 'partial',
    problems: ['Top story fine was replaced by starlink (single-outlet story without an interest match)'],
    topReplacements: [{ removed: 'fine', added: 'starlink', reason: 'single-outlet story without an interest match' }],
  });
});

it('treats a short Reddit post asking for suggestions in its text as a help request', () => {
  const post = (title, description) => ({ title, description, source_type: 'reddit', source_name: 'r/homelab' });
  assert.deepStrictEqual([
    isCommunityHelpRequest(post('My Home Firewall', 'I have installed firewall called Freesense. Please suggest your valuable suggestions to make it more secured.')),
    isCommunityHelpRequest(post('HBA 240 SMART ERRAY CARD', 'I have 8 SAS hard drives I cannot use. Can someone please help me')),
    isCommunityHelpRequest(post('My 3D printed rack is finished', 'Here are the parts I used and what I learned printing it.')),
  ], [true, true, false]);
});

it('treats questions about a problem and concise posts whose body asks for advice as help requests', () => {
  const post = (title, description) => ({ title, description, source_type: 'reddit', source_name: 'r/tasmania' });
  assert.deepStrictEqual([
    isCommunityHelpRequest(post(
      'A couple of question about the return of bond.',
      'I vacated my rental. Can I deny a claim against my bond?'
    )),
    isCommunityHelpRequest(post(
      "I'm about to do a masters in Protected Area Conservation in UTAS",
      "Just wanted to know what the work opportunities are like in Tasmania after finishing the degree."
    )),
    isCommunityHelpRequest(post(
      'Selfhosted inventory manager - OpenInvento',
      "I released v1.0.0 and now I'd love to get some feedback on it."
    )),
  ], [true, true, false]);
});
