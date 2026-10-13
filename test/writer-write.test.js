'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { writeStories } = require('../src/pipeline/writer/write');

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
    result({ is_news: true, headline: 'Written one', summary: 'Summary one.', detail: 'Detail one.', kicker: 'World', section: 'world' },
      'ollama:qwen3:8b', 'qwen3:8b', { input_tokens: 1000000, output_tokens: 1000000 }, 10),
    result({ is_news: true, headline: '', summary: 'Bad.', detail: 'Bad.', kicker: 'Bad', section: 'unknown' },
      'ollama:qwen3:8b', 'qwen3:8b', { input_tokens: 1000000, output_tokens: 1000000 }, 20),
    result({ is_news: false, headline: 'An advert', summary: 'This is an advert.', detail: 'It is sponsored.', kicker: 'Advert', section: 'australia' },
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
    { title: 'Publisher three', description: 'Teaser three.', coverage: 1, interest_matches: [], source_name: 'Three' },
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
        ...items[0], rank: 1, id: 's1', is_news: true, headline: 'Written one', summary: 'Summary one.', detail: 'Detail one.', kicker: 'World', section: 'world',
        written_by: 'ollama:qwen3:8b', write_ok: true, write_problems: ['Kicker repeated the section name'],
      },
      {
        ...items[1], rank: 2, id: 's2', is_news: true, headline: 'Publisher two', summary: 'Teaser two.', detail: 'Teaser two. More.', kicker: 'Plex', section: 'homelab',
        written_by: 'ollama:qwen3:8b', write_ok: false, write_problems: ['Headline was empty', 'Unknown section: unknown'],
      },
    ],
    dropped: [{
      ...items[2], rank: 3, id: 's3', is_news: false, headline: 'An advert', summary: 'This is an advert.', detail: 'It is sponsored.', kicker: 'Advert', section: 'australia',
      written_by: 'ollama:qwen3:8b', write_ok: true, write_problems: [],
    }],
    stats: {
      written: 2,
      repairs: 1,
      fallbacks: 1,
      not_news: 1,
      section_moves: 0,
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
    ['info', 'pipeline:writer', 'Wrote 2 stories: 1 repair, 1 fallback, 1 not news, 0 section moves'],
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
      rank: 1, id: 's1', is_news: true, headline: 'Publisher', summary: 'Teaser.', detail: 'Teaser.', kicker: 'Outlet', section: 'australia',
      written_by: 'ollama:qwen', write_ok: false, write_problems: ['Writer output was not valid JSON'],
    }],
    dropped: [],
    stats: { written: 1, repairs: 0, fallbacks: 1, not_news: 0, section_moves: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
  });
  assert.deepStrictEqual(logs, [['pipeline:writer', 'Writer failed for "Publisher", using fallback: model stopped']]);
});

it('moves unsupported local sections using configured place interests and counts the move', async () => {
  const outputs = [
    result({ is_news: true, headline: 'Queensland inquest continues', summary: 'An inquest continues.', detail: 'The hearing continues in Queensland.', kicker: 'Inquest', section: 'tasmania' }, 'ollama:test', 'test', {}, 0),
    result({ is_news: true, headline: 'Council decision', summary: 'A council has decided.', detail: 'The decision affects residents.', kicker: 'Council', section: 'tasmania' }, 'ollama:test', 'test', {}, 0),
    result({ is_news: true, headline: 'National update', summary: 'A national update.', detail: 'More details.', kicker: 'Update', section: 'australia' }, 'ollama:test', 'test', {}, 0),
  ];
  let index = 0;
  const logs = [];
  const output = await writeStories(
    [
      { title: 'Queensland inquest continues', description: 'A Queensland hearing.', interest_matches: [], coverage: 1 },
      { title: 'Council decision', description: 'A council has decided.', article_content: 'Launceston residents will be affected.', interest_matches: [], coverage: 1 },
      { title: 'National update', description: 'A national update.', interest_matches: [], coverage: 1 },
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
        title: 'Queensland inquest continues', description: 'A Queensland hearing.', interest_matches: [], coverage: 1,
        rank: 1, id: 's1', is_news: true, headline: 'Queensland inquest continues', summary: 'An inquest continues.', detail: 'The hearing continues in Queensland.', kicker: 'Inquest', section: 'australia',
        written_by: 'ollama:test', write_ok: true, write_problems: ['section moved: tasmania -> australia (no Tasmanian place named)'],
      },
      {
        title: 'Council decision', description: 'A council has decided.', article_content: 'Launceston residents will be affected.', interest_matches: [], coverage: 1,
        rank: 2, id: 's2', is_news: true, headline: 'Council decision', summary: 'A council has decided.', detail: 'The decision affects residents.', kicker: 'Council', section: 'tasmania',
        written_by: 'ollama:test', write_ok: true, write_problems: [],
      },
      {
        title: 'National update', description: 'A national update.', interest_matches: [], coverage: 1,
        rank: 3, id: 's3', is_news: true, headline: 'National update', summary: 'A national update.', detail: 'More details.', kicker: 'Update', section: 'australia',
        written_by: 'ollama:test', write_ok: true, write_problems: [],
      },
    ],
    dropped: [],
    stats: { written: 3, repairs: 1, fallbacks: 0, not_news: 0, section_moves: 1, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
  });
  assert.deepStrictEqual(logs, [
    ['debug', 'pipeline:writer', 'section moved: tasmania -> australia (no Tasmanian place named)'],
    ['info', 'pipeline:writer', 'Wrote 3 stories: 1 repair, 0 fallbacks, 0 not news, 1 section move'],
  ]);
});
