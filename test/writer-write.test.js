'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { writeStories, writtenStorySimilarity } = require('../src/pipeline/writer/write');

function result(json, backend, model, usage, duration_ms) {
  const value = { json, usage, duration_ms };
  Object.defineProperties(value, {
    backend: { value: backend },
    model: { value: model },
  });
  return value;
}

it('writes with backend concurrency while preserving rank order and aggregating all outcomes', async () => {
  const outputs = [
    result({ is_news: true, headline: 'Written story number one', summary: 'Summary one.', kicker: 'World', section: 'world' },
      'ollama:qwen3:8b', 'qwen3:8b', { input_tokens: 1000000, output_tokens: 1000000 }, 10),
    result({ is_news: true, headline: '', summary: 'Bad.', kicker: 'Bad', section: 'unknown' },
      'ollama:qwen3:8b', 'qwen3:8b', { input_tokens: 1000000, output_tokens: 1000000 }, 20),
    result({ is_news: false, headline: 'An advert', summary: 'This is an advert.', kicker: 'Advert', section: 'australia' },
      'ollama:qwen3:8b', 'qwen3:8b', { input_tokens: 1000000, output_tokens: 1000000 }, 30),
  ];
  let callIndex = 0;
  let active = 0;
  let maxActive = 0;
  const writer = {
    name: 'ollama:qwen3:8b',
    concurrency: 4,
    async write() {
      const index = callIndex++;
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      return outputs[index];
    },
  };
  const items = [
    { title: 'Publisher one', description: 'Teaser one.', coverage: 3, interest_matches: [], source_name: 'One' },
    { title: 'Publisher two', description: 'Teaser two. More.', coverage: 1, interest_matches: [{ label: 'Plex', kind: 'product', weight: 2 }], source_name: 'Two' },
    { title: 'Publisher three', description: 'Teaser three.', article_content: 'x'.repeat(500), coverage: 1, interest_matches: [], source_name: 'Three' },
  ];
  const logs = [];
  const progress = [];
  let cancellationChecks = 0;

  const written = await writeStories(
    items,
    writer,
    { getWriterArticleChars: () => 6000 },
    {
      info: (...args) => logs.push(['info', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
    },
    (...args) => progress.push(args),
    () => { cancellationChecks++; }
  );

  assert.strictEqual(maxActive, 3);
  assert.strictEqual(cancellationChecks, 3);
  assert.deepStrictEqual(written, {
    stories: [
      {
        ...items[0], rank: 1, id: 's1', is_news: true, headline: 'Written story number one', summary: 'Summary one.', kicker: '', section: 'world',
        written_by: 'ollama:qwen3:8b', write_ok: true, write_problems: ['Kicker repeated the section name'],
      },
      {
        ...items[1], rank: 2, id: 's2', is_news: true, headline: 'Publisher two', summary: 'Teaser two.', kicker: 'Plex', section: 'homelab',
        written_by: 'ollama:qwen3:8b', write_ok: false, write_problems: ['Headline was empty', 'Unknown section: unknown'],
      },
    ],
    dropped: [{
      ...items[2], rank: 3, id: 's3', is_news: false, headline: 'An advert', summary: 'This is an advert.', kicker: 'Advert', section: 'australia',
      written_by: 'ollama:qwen3:8b', write_ok: true, write_problems: [],
    }],
    stats: {
      written: 2,
      repairs: 1, headline_retries: 0,
      fallbacks: 1,
      not_news: 1,
      not_news_overridden: 0,
      section_moves: 0,
      facts_removed: 0,
      numbers_unsupported: 0,
      input_tokens: 3000000,
      output_tokens: 3000000,
      duration_ms: 60,
    },
  });
  assert.deepStrictEqual(progress, [
    ['write', 0, 3], ['write', 1, 3], ['write', 2, 3], ['write', 3, 3],
  ]);
  assert.deepStrictEqual(logs, [
    ['warn', 'pipeline:writer', 'Writer output invalid for "Publisher two", using fallback', { problems: ['Headline was empty', 'Unknown section: unknown'] }],
    ['info', 'pipeline:writer', 'Not news: "Publisher three"'],
    ['info', 'pipeline:writer', 'Wrote 2 stories: 1 repair, 0 headline retries, 1 fallback, 1 not news, 0 not-news overrides, 0 section moves, 0 facts removed, 0 unsupported numbers'],
  ]);
});

it('turns a thrown story call into a publisher fallback', async () => {
  const writer = { name: 'ollama:qwen', concurrency: 1, async write() { throw new Error('model stopped'); } };
  const logs = [];
  const output = await writeStories(
    [{ title: 'Publisher', description: 'Teaser.', source_name: 'Outlet', interest_matches: [], coverage: 1 }],
    writer,
    { getWriterArticleChars: () => 6000 },
    { info() {}, warn: (...args) => logs.push(args) }
  );
  assert.deepStrictEqual(output, {
    stories: [{
      title: 'Publisher', description: 'Teaser.', source_name: 'Outlet', interest_matches: [], coverage: 1,
      rank: 1, id: 's1', is_news: true, headline: 'Publisher', summary: 'Teaser.', kicker: 'Outlet', section: 'australia',
      written_by: 'ollama:qwen', write_ok: false, write_problems: ['Writer output was not valid JSON'],
    }],
    dropped: [],
    stats: { written: 1, repairs: 0, headline_retries: 0, fallbacks: 1, not_news: 0, not_news_overridden: 0, section_moves: 0, facts_removed: 0, numbers_unsupported: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
  });
  assert.deepStrictEqual(logs, [['pipeline:writer', 'Writer failed for "Publisher", using fallback: model stopped']]);
});

it('moves unsupported local sections using configured place interests and counts the move', async () => {
  const outputs = [
    result({ is_news: true, headline: 'Queensland inquest hearing continues', summary: 'An inquest continues.', kicker: 'Inquest', section: 'tasmania' }, 'ollama:test', 'test', {}, 0),
    result({ is_news: true, headline: 'Council approves new service', summary: 'A council has decided.', kicker: 'Council', section: 'tasmania' }, 'ollama:test', 'test', {}, 0),
    result({ is_news: true, headline: 'National government announces new policy', summary: 'A national update.', kicker: 'Update', section: 'australia' }, 'ollama:test', 'test', {}, 0),
  ];
  let index = 0;
  const logs = [];
  const output = await writeStories(
    [
      { title: 'Queensland inquest hearing continues', description: 'A Queensland hearing.', interest_matches: [], coverage: 1 },
      { title: 'Council approves new service', description: 'A council has decided.', article_content: 'Launceston residents will be affected.', interest_matches: [], coverage: 1 },
      { title: 'National government announces new policy', description: 'A national update.', interest_matches: [], coverage: 1 },
    ],
    { name: 'ollama:test', concurrency: 1, async write() { return outputs[index++]; } },
    {
      getWriterArticleChars: () => 6000,
      getInterests: () => [{ label: 'Local places', kind: 'place', terms: ['Launceston'], weight: 1 }],
    },
    {
      info: (...args) => logs.push(['info', ...args]),
      warn() {},
      debug: (...args) => logs.push(['debug', ...args]),
    }
  );

  assert.deepStrictEqual(output, {
    stories: [
      {
        title: 'Queensland inquest hearing continues', description: 'A Queensland hearing.', interest_matches: [], coverage: 1,
        rank: 1, id: 's1', is_news: true, headline: 'Queensland inquest hearing continues', summary: 'An inquest continues.', kicker: 'Inquest', section: 'australia',
        written_by: 'ollama:test', write_ok: true, write_problems: ['section moved: tasmania -> australia (no Tasmanian place named)'],
      },
      {
        title: 'Council approves new service', description: 'A council has decided.', article_content: 'Launceston residents will be affected.', interest_matches: [], coverage: 1,
        rank: 2, id: 's2', is_news: true, headline: 'Council approves new service', summary: 'A council has decided.', kicker: 'Council', section: 'tasmania',
        written_by: 'ollama:test', write_ok: true, write_problems: [],
      },
      {
        title: 'National government announces new policy', description: 'A national update.', interest_matches: [], coverage: 1,
        rank: 3, id: 's3', is_news: true, headline: 'National government announces new policy', summary: 'A national update.', kicker: 'Update', section: 'australia',
        written_by: 'ollama:test', write_ok: true, write_problems: [],
      },
    ],
    dropped: [],
    stats: { written: 3, repairs: 1, headline_retries: 0, fallbacks: 0, not_news: 0, not_news_overridden: 0, section_moves: 1, facts_removed: 0, numbers_unsupported: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
  });
  assert.deepStrictEqual(logs, [
    ['debug', 'pipeline:writer', 'section moved: tasmania -> australia (no Tasmanian place named)'],
    ['info', 'pipeline:writer', 'Wrote 3 stories: 1 repair, 0 headline retries, 0 fallbacks, 0 not news, 0 not-news overrides, 1 section move, 0 facts removed, 0 unsupported numbers'],
  ]);
});

it('counts removed facts and unsupported numbers in writer statistics and logging', async () => {
  const logs = [];
  const output = await writeStories(
    [{ title: 'Sudden death', description: 'The death is under investigation.', interest_matches: [], coverage: 1 }],
    {
      name: 'ollama:test', concurrency: 1, async write() {
        return result({
          is_news: true,
          headline: 'Actor dies at 34',
          summary: 'The actor died by suicide at 34. The death is under investigation.',
          kicker: 'Tribute',
          section: 'world',
        }, 'ollama:test', 'test', {}, 0);
      },
    },
    { getWriterArticleChars: () => 6000 },
    { info: (...args) => logs.push(args), warn() {} }
  );

  assert.deepStrictEqual(output.stats, {
    written: 1, repairs: 1, headline_retries: 1, fallbacks: 0, not_news: 0, not_news_overridden: 0, section_moves: 0,
    facts_removed: 1, numbers_unsupported: 2, input_tokens: 0, output_tokens: 0, duration_ms: 0,
  });
  assert.deepStrictEqual(logs, [[
    'pipeline:writer',
    'Wrote 1 stories: 1 repair, 1 headline retry, 0 fallbacks, 0 not news, 0 not-news overrides, 0 section moves, 1 fact removed, 2 unsupported numbers',
  ]]);
});

it('overrides not-news only for non-community stories without substantial article text', async () => {
  const items = [
    { title: 'Team handed 3-0 loss over jersey slogan in Hobart', description: 'A team was penalised.', article_content: '', source_name: 'The Mercury', interest_matches: [], coverage: 1 },
    { title: 'Can someone help with my server?', description: 'A beginner asks for help.', article_content: '', source_type: 'reddit', source_name: 'Reddit', interest_matches: [], coverage: 1 },
    { title: 'Long-form advertorial', description: 'A promotional feature.', article_content: 'x'.repeat(500), source_name: 'Publisher', interest_matches: [], coverage: 1 },
  ];
  let index = 0;
  const outputs = [
    { is_news: false, headline: 'Team handed 3-0 loss over jersey slogan in Hobart', summary: 'A team was penalised.', kicker: 'Sport', section: 'tasmania' },
    { is_news: false, headline: 'Can someone help with my server?', summary: 'A beginner asks for help.', kicker: 'Help', section: 'homelab' },
    { is_news: false, headline: 'Long-form advertorial', summary: 'A promotional feature.', kicker: 'Advert', section: 'australia' },
  ];
  const logs = [];
  const output = await writeStories(items, {
    name: 'ollama:test',
    concurrency: 1,
    async write() { return result(outputs[index++], 'ollama:test', 'test', {}, 0); },
  }, { getWriterArticleChars: () => 6000 }, {
    info: (...args) => logs.push(args),
    warn() {},
  });

  assert.deepStrictEqual(output, {
    stories: [{
      ...items[0], rank: 1, id: 's1', is_news: true,
      headline: 'Team handed 3-0 loss over jersey slogan in Hobart',
      summary: 'A team was penalised.',
      kicker: 'Sport', section: 'tasmania', written_by: 'ollama:test', write_ok: true,
      write_problems: ['kept: no article text, not-news ignored'],
    }],
    dropped: [
      {
        ...items[1], rank: 2, id: 's2', is_news: false,
        headline: 'Can someone help with my server?', summary: 'A beginner asks for help.',
        kicker: 'Help', section: 'homelab',
        written_by: 'ollama:test', write_ok: true, write_problems: [],
      },
      {
        ...items[2], rank: 3, id: 's3', is_news: false,
        headline: 'Long-form advertorial', summary: 'A promotional feature.',
        kicker: 'Advert', section: 'australia',
        written_by: 'ollama:test', write_ok: true, write_problems: [],
      },
    ],
    stats: {
      written: 1, repairs: 1, headline_retries: 0, fallbacks: 0, not_news: 2, not_news_overridden: 1,
      section_moves: 0, facts_removed: 0, numbers_unsupported: 0,
      input_tokens: 0, output_tokens: 0, duration_ms: 0,
    },
  });
  assert.deepStrictEqual(logs, [
    ['pipeline:writer', 'Not news: "Can someone help with my server?"'],
    ['pipeline:writer', 'Not news: "Long-form advertorial"'],
    ['pipeline:writer', 'Wrote 1 stories: 1 repair, 0 headline retries, 0 fallbacks, 2 not news, 1 not-news override, 0 section moves, 0 facts removed, 0 unsupported numbers'],
  ]);
});

const retryItem = { title: 'Tough Decisions', description: 'The RBA minutes discuss inflation.', source_name: 'Outlet' };
const retryValue = { is_news: true, headline: 'Tough Decisions', summary: 'The RBA minutes discuss inflation and future interest rates.', kicker: 'Rates', section: 'australia' };
const retrySettings = { getWriterArticleChars: () => 6000 };

it('retries a vague headline once with the full source prompt and validates the replacement', async () => {
  const { writeSystemPrompt, writeUserPrompt, WRITE_SCHEMA } = require('../src/pipeline/writer/prompts');
  const calls = [];
  const logs = [];
  const replacement = { ...retryValue, headline: 'RBA minutes show continued concern about inflation', section: 'world', summary: 'An official died by suicide. The RBA minutes discuss inflation in NSW.' };
  const output = await writeStories([retryItem], {
    name: 'test', async write(...args) {
      calls.push(args);
      return result(calls.length === 1 ? retryValue : replacement, 'test', 'test', { input_tokens: 10, output_tokens: 5 }, 7);
    },
  }, retrySettings, { info: (...args) => logs.push(args), debug: (...args) => logs.push(args) });
  const prompt = writeUserPrompt(retryItem, { articleChars: 6000 });
  assert.deepStrictEqual(calls, [
    [writeSystemPrompt(), prompt, WRITE_SCHEMA],
    [writeSystemPrompt(), `${prompt}\n\nHeadline "Tough Decisions" is too vague; write a specific headline of 6–14 words saying what happened, from the supplied text only.`, WRITE_SCHEMA],
  ]);
  assert.deepStrictEqual(output, {
    stories: [{ ...retryItem, rank: 1, id: 's1', ...replacement, summary: 'The RBA minutes discuss inflation in NSW.', section: 'australia', written_by: 'test', write_ok: true,
      write_problems: ['removed unsupported claim: "suicid"', 'section moved: world -> australia (Australian place named; no overseas place named)'] }],
    dropped: [],
    stats: { written: 1, repairs: 1, headline_retries: 1, fallbacks: 0, not_news: 0, not_news_overridden: 0, section_moves: 1, facts_removed: 1, numbers_unsupported: 0, input_tokens: 20, output_tokens: 10, duration_ms: 14 },
  });
  assert.deepStrictEqual(logs, [
    ['pipeline:writer', 'section moved: world -> australia (Australian place named; no overseas place named)'],
    ['pipeline:writer', 'Wrote 1 stories: 1 repair, 1 headline retry, 0 fallbacks, 0 not news, 0 not-news overrides, 1 section move, 1 fact removed, 0 unsupported numbers'],
  ]);
});

for (const [label, second, problem] of [
  ['still vague', { ...retryValue, headline: 'Rates', summary: 'Changed summary.' }, 'Headline retry was still vague: "Rates"'],
  ['invalid', { ...retryValue, headline: 'RBA minutes discuss inflation again', summary: '' }, 'Headline retry was invalid'],
  ['throws', new Error('model stopped'), 'Headline retry failed: model stopped'],
]) {
  it(`retains the first validated answer when the headline retry ${label}`, async () => {
    let calls = 0;
    const output = await writeStories([retryItem], { name: 'test', async write() {
      calls++;
      if (calls === 2 && second instanceof Error) throw second;
      return { json: calls === 1 ? retryValue : second };
    } }, retrySettings);
    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(output, {
      stories: [{ ...retryItem, rank: 1, id: 's1', ...retryValue, written_by: 'test', write_ok: true, write_problems: [problem] }], dropped: [],
      stats: { written: 1, repairs: 1, headline_retries: 1, fallbacks: 0, not_news: 0, not_news_overridden: 0, section_moves: 0, facts_removed: 0, numbers_unsupported: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
    });
  });
}

it('retries one to three words but accepts four words and skips rejected news and invalid writes', async () => {
  const cases = [
    [{ ...retryValue, headline: 'Rates' }, 2],
    [retryValue, 2],
    [{ ...retryValue, headline: 'Rates stay high' }, 2],
    [{ ...retryValue, headline: 'RBA rates remain unchanged' }, 1],
    [{ ...retryValue, is_news: false }, 1],
    [null, 1],
  ];
  for (const [first, expected] of cases) {
    let calls = 0;
    const output = await writeStories([{ ...retryItem, source_type: 'reddit' }], { name: 'test', async write() {
      calls++;
      return { json: calls === 1 ? first : { ...retryValue, headline: 'RBA rates remain unchanged' } };
    } }, retrySettings);
    assert.strictEqual(calls, expected);
    assert.strictEqual(output.stats.headline_retries, expected - 1);
    if (expected === 2) assert.strictEqual(output.stories[0].headline, 'RBA rates remain unchanged');
  }
});

it('keeps the not-news override on a retried unread publisher story', async () => {
  let calls = 0;
  const output = await writeStories([retryItem], { name: 'test', async write() {
    calls++;
    return { json: calls === 1 ? retryValue : { ...retryValue, headline: 'RBA minutes discuss inflation again', is_news: false } };
  } }, retrySettings);
  assert.strictEqual(calls, 2);
  assert.strictEqual(output.stats.not_news_overridden, 1);
  assert.deepStrictEqual(output.stories[0], { ...retryItem, rank: 1, id: 's1', ...retryValue, headline: 'RBA minutes discuss inflation again', written_by: 'test', write_ok: true, write_problems: ['kept: no article text, not-news ignored'] });
  assert.deepStrictEqual(output.dropped, []);
});

it('retries missing-text meta writing once and drops it if it persists', async () => {
  const source = {
    title: 'Hobart CBD jobs face cuts',
    description: 'Job cuts are expected in the Hobart CBD. A decision is due next week.',
    source_name: 'The Mercury',
    interest_matches: [],
  };
  const bad = {
    is_news: true,
    headline: 'Hobart CBD jobs face cuts',
    summary: 'No article text was provided, so no summary can be written.',
    kicker: 'Jobs',
    section: 'tasmania',
  };
  const calls = [];
  const output = await writeStories([source], {
    name: 'test',
    async write(...args) { calls.push(args); return { json: bad }; },
  }, retrySettings);
  const { writeSystemPrompt, writeUserPrompt, WRITE_SCHEMA } = require('../src/pipeline/writer/prompts');
  const prompt = writeUserPrompt(source, { articleChars: 6000 });
  assert.deepStrictEqual(calls, [
    [writeSystemPrompt(), prompt, WRITE_SCHEMA],
    [writeSystemPrompt(), `${prompt}\n\nRewrite any affected summary or kicker as plain news from the headline and teasers. Never mention missing, absent, unavailable or unprovided text, content, information or details. Write complete sentences that make sense alone.`, WRITE_SCHEMA],
  ]);
  assert.deepStrictEqual(output, {
    stories: [],
    dropped: [{
      ...source,
      rank: 1,
      id: 's1',
      ...bad,
      is_news: false,
      written_by: 'test',
      write_ok: true,
      write_problems: ['page-description retry still described unavailable source content'],
    }],
    stats: { written: 0, repairs: 1, headline_retries: 0, fallbacks: 0, not_news: 1, not_news_overridden: 0, section_moves: 0, facts_removed: 0, numbers_unsupported: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
  });
});

it('drops persistent headline-meta writing when there is no teaser to fall back on', async () => {
  const source = {
    title: 'Character.ai Files for Bankruptcy',
    description: '',
    article_content: 'Subscribe to continue reading. '.repeat(10),
    source_name: 'Publisher',
    interest_matches: [],
  };
  const bad = {
    is_news: true,
    headline: 'Character.ai Files for Bankruptcy',
    summary: "The headline suggests Character.ai's bankruptcy could signal a wider decline.",
    kicker: 'AI companies',
    section: 'tech',
  };
  let calls = 0;
  const output = await writeStories([source], {
    name: 'test',
    async write() { calls++; return { json: bad }; },
  }, retrySettings);
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(output, {
    stories: [],
    dropped: [{
      ...source,
      rank: 1,
      id: 's1',
      ...bad,
      is_news: false,
      written_by: 'test',
      write_ok: true,
      write_problems: ['page-description retry still described unavailable source content'],
    }],
    stats: { written: 0, repairs: 1, headline_retries: 0, fallbacks: 0, not_news: 1, not_news_overridden: 0, section_moves: 0, facts_removed: 0, numbers_unsupported: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
  });
});

it('retries a short summary unrelated to its headline and falls back to the teaser if it persists', async () => {
  const source = {
    title: 'Character.ai Bankruptcy Is First AI Bubble Domino to Fall',
    description: 'Character.ai has filed for bankruptcy amid mounting financial pressure.',
    article_content: 'Become a paid member for unlimited access. '.repeat(20),
    source_name: '404 Media',
    interest_matches: [],
  };
  const bad = {
    is_news: true,
    headline: source.title,
    summary: 'New music genre just dropped.',
    kicker: 'AI bubble',
    section: 'tech',
  };
  const calls = [];
  const output = await writeStories([source], {
    name: 'test',
    async write(...args) { calls.push(args); return { json: bad }; },
  }, retrySettings);
  const { writeSystemPrompt, writeUserPrompt, WRITE_SCHEMA } = require('../src/pipeline/writer/prompts');
  const prompt = writeUserPrompt(source, { articleChars: 6000 });
  assert.deepStrictEqual(calls, [
    [writeSystemPrompt(), prompt, WRITE_SCHEMA],
    [writeSystemPrompt(), `${prompt}\n\nRewrite any affected summary or kicker as plain news from the headline and teasers. Never mention missing, absent, unavailable or unprovided text, content, information or details. Write complete sentences that make sense alone.`, WRITE_SCHEMA],
  ]);
  assert.deepStrictEqual(output, {
    stories: [{
      ...source,
      rank: 1,
      id: 's1',
      ...bad,
      summary: source.description,
      written_by: 'test',
      write_ok: true,
      write_problems: [
        'Missing-text retry still referred to unavailable source text',
        'Summary replaced with the first teaser sentence',
      ],
    }],
    dropped: [],
    stats: { written: 1, repairs: 1, headline_retries: 0, fallbacks: 0, not_news: 0, not_news_overridden: 0, section_moves: 0, facts_removed: 0, numbers_unsupported: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
  });
});

it('drops a persistently unrelated short summary with no teaser but keeps the eight-word boundary', async () => {
  const sources = [
    {
      title: 'Character.ai Bankruptcy Is First AI Bubble Domino to Fall',
      description: '',
      article_content: 'Become a paid member for unlimited access. '.repeat(20),
      source_name: '404 Media',
      interest_matches: [],
    },
    {
      title: 'Character.ai Bankruptcy Is First AI Bubble Domino to Fall',
      description: 'A separate teaser is available.',
      article_content: 'Become a paid member for unlimited access. '.repeat(20),
      source_name: '404 Media',
      interest_matches: [],
    },
  ];
  const summaries = ['New music genre just dropped.', 'Fresh music genres suddenly appeared across online platforms.'];
  let index = 0;
  const output = await writeStories(sources, {
    name: 'test', concurrency: 1,
    async write() {
      const sourceIndex = Math.floor(index / 2);
      index++;
      return { json: {
        is_news: true,
        headline: sources[sourceIndex].title,
        summary: summaries[sourceIndex],
        kicker: 'AI bubble',
        section: 'tech',
      } };
    },
  }, retrySettings);
  assert.deepStrictEqual(output, {
    stories: [{
      ...sources[1], rank: 2, id: 's2', is_news: true, headline: sources[1].title,
      summary: summaries[1], kicker: 'AI bubble', section: 'tech',
      written_by: 'test', write_ok: true, write_problems: [],
    }],
    dropped: [{
      ...sources[0], rank: 1, id: 's1', is_news: false, headline: sources[0].title,
      summary: '', kicker: 'AI bubble', section: 'tech',
      written_by: 'test', write_ok: true,
      write_problems: [
        'Missing-text retry still referred to unavailable source text',
        'not news: nothing beyond the headline',
      ],
    }],
    stats: { written: 1, repairs: 1, headline_retries: 0, fallbacks: 0, not_news: 1, not_news_overridden: 0, section_moves: 0, facts_removed: 0, numbers_unsupported: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
  });
});

it('drops same-event stories after writing, merges their sources, and keeps same-topic stories separate', async () => {
  const items = [
    {
      title: 'Michelin Guide dishes out first Australian stars to array of SA restaurants',
      description: 'South Australian restaurants received the first Michelin stars in Australia, with one venue earning two stars.',
      article_content: 'x'.repeat(500), interest_matches: [], section: 'australia', rank: 39,
      sources: [{ name: 'ABC', url: 'https://example.com/abc-michelin' }],
    },
    {
      title: 'Last-minute company trade deals loom',
      description: 'Multiple company trade deals were finalised late, involving several assets and contracts across different businesses.',
      article_content: 'x'.repeat(500), interest_matches: [], section: 'australia', rank: 21,
      sources: [{ name: 'ABC', url: 'https://example.com/afl-deals' }],
    },
    {
      title: 'Ten South Australian Restaurants Awarded Michelin Stars',
      description: 'Ten South Australian restaurants received one Michelin star, with Magill Estate Restaurant winning two.',
      article_content: 'x'.repeat(500), interest_matches: [], section: 'australia', rank: 58,
      sources: [{ name: 'Guardian', url: 'https://example.com/guardian-michelin' }],
    },
    {
      title: 'Almost perfect corporate trade period | The deal winners and losers',
      description: 'Companies concluded the trade period with asset movements while experts rated the winners and losers.',
      article_content: 'x'.repeat(500), interest_matches: [], section: 'australia', rank: 26,
      sources: [{ name: 'Mercury', url: 'https://example.com/afl-ratings' }],
    },
  ];
  let index = 0;
  const outputs = items.map(item => ({
    is_news: true,
    headline: item.title,
    summary: item.description,
    kicker: item.title.startsWith('Michelin') || item.title.startsWith('Ten South') ? 'Dining' : 'Deal watch',
    section: 'australia',
  }));
  const output = await writeStories(items, {
    name: 'test', concurrency: 1,
    async write() { return { json: outputs[index++] }; },
  }, retrySettings);
  const story = (item, value, id, sources = item.sources) => ({
    ...item,
    id,
    ...value,
    sources,
    written_by: 'test',
    write_ok: true,
    write_problems: [],
  });
  const first = story(items[0], outputs[0], 's1', [
    { name: 'ABC', url: 'https://example.com/abc-michelin' },
    { name: 'Guardian', url: 'https://example.com/guardian-michelin' },
  ]);
  const duplicate = story(items[2], outputs[2], 's3');
  duplicate.is_news = false;
  duplicate.write_problems = ['duplicate: same event as s1'];
  duplicate.duplicate_of = 's1';
  assert.deepStrictEqual(output, {
    stories: [
      first,
      story(items[1], outputs[1], 's2'),
      story(items[3], outputs[3], 's4'),
    ],
    dropped: [duplicate],
    stats: {
      written: 3, repairs: 0, headline_retries: 0, fallbacks: 0, not_news: 0, not_news_overridden: 0,
      section_moves: 0, facts_removed: 0, numbers_unsupported: 0,
      input_tokens: 0, output_tokens: 0, duration_ms: 0,
    },
  });
});

it('compares written summaries with source teasers for duplicates and ignores legacy detail', () => {
  const left = {
    headline: 'Restaurants receive awards',
    summary: 'The honours were announced overnight.',
    title: 'Michelin Guide awards first Australian stars to South Australian restaurants',
    description: 'Ten South Australian restaurants received Michelin stars, including one two-star venue.',
    detail: 'Legacy prose about an unrelated football match.',
  };
  const right = {
    headline: 'Dining venues win honours',
    summary: 'The results mark a national first.',
    title: 'Ten South Australian restaurants awarded Michelin stars',
    description: 'South Australian restaurants won the first Michelin stars awarded in Australia.',
    detail: 'Different legacy prose about a software release.',
  };

  assert.deepStrictEqual(writtenStorySimilarity(left, right), {
    score: 0.5882352941176471,
    shared: 10,
  });
  assert.deepStrictEqual(
    writtenStorySimilarity({ ...left, detail: right.detail }, { ...right, detail: left.detail }),
    { score: 0.5882352941176471, shared: 10 }
  );
});

it('forces deterministic community help requests to not-news regardless of engagement', async () => {
  const items = [
    { title: 'Help me pick a rack please', source_type: 'reddit', source_name: 'r/homelab', article_content: 'x'.repeat(500), interest_matches: [] },
    { title: 'Hardware question', source_type: 'reddit', source_name: 'r/homelab', score: 500, comment_count: 80, article_content: 'x'.repeat(500), interest_matches: [] },
  ];
  const written = headline => ({ is_news: true, headline, summary: 'A user asks the community for homelab hardware advice.', kicker: 'Hardware Help', section: 'homelab' });
  const outputs = [written(items[0].title), written('Community discusses homelab hardware choices')];
  let index = 0;
  const output = await writeStories(items, {
    name: 'test', async write() { return { json: outputs[index++] }; },
  }, retrySettings);
  assert.deepStrictEqual(output, {
    stories: [],
    dropped: [
      {
        ...items[0], rank: 1, id: 's1', ...written(items[0].title), is_news: false, kicker: 'Hardware help',
        written_by: 'test', write_ok: true,
        write_problems: ['not news: community help or buying request'],
      },
      {
        ...items[1], rank: 2, id: 's2', ...outputs[1], is_news: false, kicker: 'Hardware help',
        written_by: 'test', write_ok: true,
        write_problems: ['not news: community help or buying request'],
      },
    ],
    stats: { written: 0, repairs: 2, headline_retries: 0, fallbacks: 0, not_news: 2, not_news_overridden: 0, section_moves: 0, facts_removed: 0, numbers_unsupported: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
  });
});

it('forces a community question with fewer than two real replies to not-news', async () => {
  const items = [
    {
      title: "What's the deal with an AI-generated meme character ending up in a federal lawsuit?",
      source_type: 'reddit', source_name: 'r/OutOfTheLoop', interest_matches: [],
      top_comments: ['Friendly reminder that all top level comments must: start with "Answer: ". I am a bot.'],
    },
    {
      title: "What's going on with Jennifer Meyers?",
      source_type: 'reddit', source_name: 'r/OutOfTheLoop', interest_matches: [],
      top_comments: ['Friendly reminder that all top level comments must: start with "Answer: ". I am a bot.', 'Answer one.', 'Answer two.'],
    },
  ];
  const written = headline => ({ is_news: true, headline, summary: 'People in the community asked what happened in detail.', kicker: 'Online culture', section: 'internet' });
  let index = 0;
  const output = await writeStories(items, {
    name: 'test', async write() { return { json: written(items[index++].title) }; },
  }, retrySettings);

  assert.deepStrictEqual({
    stories: output.stories.map(story => ({ title: story.title, is_news: story.is_news, problems: story.write_problems })),
    dropped: output.dropped.map(story => ({ title: story.title, is_news: story.is_news, problems: story.write_problems })),
    stats: output.stats,
  }, {
    stories: [{ title: "What's going on with Jennifer Meyers?", is_news: true, problems: [] }],
    dropped: [{
      title: "What's the deal with an AI-generated meme character ending up in a federal lawsuit?",
      is_news: false,
      problems: ['not news: community question has fewer than two real replies'],
    }],
    stats: {
      written: 1, repairs: 1, headline_retries: 0, fallbacks: 0, not_news: 1, not_news_overridden: 0,
      section_moves: 0, facts_removed: 0, numbers_unsupported: 0,
      input_tokens: 0, output_tokens: 0, duration_ms: 0,
    },
  });
});

it('retries over-18-word and quote-only Reddit headlines once', async () => {
  const cases = [
    ['Kernel Summit says the time has come to make it harder for new people to contribute code after AI submission flood', 'Linus Torvalds calls for tighter kernel contribution rules'],
    ['“I am joining the biggest club in the land” — Lachie Whitfield', 'Lachie Whitfield completes move to Carlton football club'],
  ];
  const calls = [];
  for (const [headline, replacement] of cases) {
    let count = 0;
    const output = await writeStories([{
      title: headline, source_type: 'reddit', source_name: 'Reddit', description: 'The move was announced.', interest_matches: [],
    }], {
      name: 'test', async write() {
        count++;
        calls.push(headline);
        return { json: { is_news: true, headline: count === 1 ? headline : replacement, summary: 'Reddit users discussed the announced move and its consequences today.', kicker: 'Code Rules', section: 'tech' } };
      },
    }, retrySettings);
    assert.deepStrictEqual({ count, headline: output.stories[0].headline, retries: output.stats.headline_retries }, {
      count: 2, headline: replacement, retries: 1,
    });
  }
  assert.deepStrictEqual(calls, [cases[0][0], cases[0][0], cases[1][0], cases[1][0]]);
});

it('leaves out a story when only its headline is available, but keeps one with another outlet\'s teaser', async () => {
  const mercury = title => ({ title, description: `${title} The Mercury`, source_name: 'The Mercury (Google News)', article_content: '' });
  const items = [
    mercury('Hobart now dearest capital for petrol'),
    { ...mercury('Job cuts to hit Hobart CBD'), merged_descriptions: ['Job cuts to hit Hobart CBD The Mercury', 'About 200 public service roles will move out of the Hobart CBD next year.'] },
  ];
  const written = { is_news: false, summary: 'Prices rose as part of a new government venture.', kicker: 'Petrol prices', section: 'tasmania' };
  let call = 0;
  const output = await writeStories(items, { name: 'test', async write() {
    return { json: { ...written, headline: items[call++].title } };
  } }, retrySettings);
  assert.deepStrictEqual(output.dropped.map(story => [story.headline, story.summary, story.write_problems]), [[
    'Hobart now dearest capital for petrol', '', ['not news: only the headline is available'],
  ]]);
  assert.deepStrictEqual(output.stories.map(story => [story.headline, story.write_problems]), [[
    'Job cuts to hit Hobart CBD', ['kept: no article text, not-news ignored'],
  ]]);
});

it('drops a low-text headline echo but keeps a summary that adds a substantive fact', async () => {
  const items = [
    {
      title: 'Suicide rates highest ever among middle-aged men',
      description: '', article_content: '', source_type: 'hackernews', source_name: 'Hacker News', interest_matches: [],
    },
    {
      title: 'Paywalled plugins banned, Spotify and existing plugins exempt',
      description: 'RuneLite announced that plugins with paywalled functionality are no longer allowed.',
      article_content: '', source_name: 'RuneLite', default_category: 'gaming', interest_matches: [],
    },
  ];
  const values = [
    { is_news: true, headline: items[0].title, summary: 'Suicide rates are reported as the highest ever among middle-aged men.', kicker: 'Suicide rates', section: 'world' },
    { is_news: true, headline: items[1].title, summary: `${items[1].description} Existing free plugins remain available.`, kicker: 'Plugin rules', section: 'gaming' },
  ];
  let index = 0;
  const output = await writeStories(items, {
    name: 'test', concurrency: 1, async write() { return { json: values[index++] }; },
  }, retrySettings);
  assert.deepStrictEqual(output, {
    stories: [{
      ...items[1], rank: 2, id: 's2', ...values[1], written_by: 'test', write_ok: true, write_problems: [],
    }],
    dropped: [{
      ...items[0], rank: 1, id: 's1', ...values[0], is_news: false, section: 'tech',
      written_by: 'test', write_ok: true, write_problems: [
        'section moved: world -> tech (Hacker News source)',
        'not news: nothing beyond the headline',
      ],
    }],
    stats: { written: 1, repairs: 1, headline_retries: 0, fallbacks: 0, not_news: 1, not_news_overridden: 0, section_moves: 1, facts_removed: 0, numbers_unsupported: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
  });
});

it('keeps a long publisher headline rather than asking for a rewrite', async () => {
  const headline = 'The IMF says we need to make urgent choices but are they choices the Albanese government is willing to make this year';
  let count = 0;
  const output = await writeStories([{
    title: headline, source_name: 'The Guardian AU', description: 'The IMF advises targeted income support.', interest_matches: [],
  }], {
    name: 'test', async write() {
      count++;
      return { json: { is_news: true, headline, summary: 'The IMF advises targeted income support.', kicker: 'Economic advice', section: 'australia' } };
    },
  }, retrySettings);
  assert.deepStrictEqual({ count, headline: output.stories[0].headline, retries: output.stats.headline_retries }, {
    count: 1, headline, retries: 0,
  });
});
