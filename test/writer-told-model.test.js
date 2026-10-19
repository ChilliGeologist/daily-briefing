'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { createWriter, createToldWriter } = require('../src/pipeline/writer');
const { addToldToStories } = require('../src/pipeline/writer/told');

function response(body, { ok = true, status = 200, text = '' } = {}) {
  return {
    ok,
    status,
    async json() { return body; },
    async text() { return text; },
  };
}

function settings(overrides = {}) {
  return {
    getOllamaUrl: () => 'http://ollama:11434',
    getWriterOllamaModel: () => 'writer-model',
    getToldOllamaModel: () => 'told-model',
    getToldNumThread: () => 4,
    getOllamaNumCtx: () => 8192,
    ...overrides,
  };
}

it('sends told requests with the bounded thread count and five-minute keep-alive', async () => {
  const calls = [];
  const toldWriter = createToldWriter(settings(), {}, {
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return response({ message: { content: '{"subjects":[]}' } });
    },
  });

  await toldWriter.tell('system', 'user', { type: 'object' });
  await toldWriter.unload();

  assert.strictEqual(calls[0].url, 'http://ollama:11434/api/chat');
  assert.strictEqual(calls[0].body.keep_alive, '5m');
  assert.deepStrictEqual(calls[0].body.options, {
    temperature: 0.3,
    num_ctx: 8192,
    num_predict: 1200,
    num_thread: 4,
  });
  assert.deepStrictEqual(calls[1], {
    url: 'http://ollama:11434/api/generate',
    body: { model: 'told-model', keep_alive: 0 },
  });
});

it('falls back once to the writer model after a told-model failure', async () => {
  const calls = [];
  const warnings = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.model === 'told-model') return response(null, { ok: false, status: 404, text: 'model missing' });
    return response({ message: { content: JSON.stringify({ subjects: [{
      name: 'Leader',
      kind: 'person',
      stances: [
        { outlet: 'One', stance: 'against', quote: 'sharp attack on Leader' },
        { outlet: 'Two', stance: 'plain', quote: '' },
      ],
    }] }) } });
  };
  const log = { warn(component, message) { warnings.push([component, message]); } };
  const writer = createWriter(settings(), log, { fetchImpl });
  const toldWriter = createToldWriter(settings(), log, { fetchImpl });
  const story = {
    title: 'Leader faces criticism',
    outlet_versions: [
      { name: 'One', headline: 'Sharp attack on Leader', text: 'A sharp attack on Leader intensified.', url: 'https://one.test/story' },
      { name: 'Two', headline: 'Leader gives update', text: 'The leader spoke on Monday.', url: 'https://two.test/story' },
    ],
  };

  await addToldToStories([story], toldWriter, writer, log);

  assert.deepStrictEqual(calls.map(call => call.model), ['told-model', 'writer-model']);
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0][1], /retrying with writer model/i);
  assert.strictEqual(story.told.differs, true);
});

it('uses outlets only when both told and writer model calls fail', async () => {
  const warnings = [];
  const failing = model => ({
    name: `ollama:${model}`,
    concurrency: 1,
    async tell() { throw new Error(`${model} unavailable`); },
  });
  const story = {
    title: 'A story',
    outlet_versions: [
      { name: 'One', headline: 'One headline', url: 'https://one.test/story' },
      { name: 'Two', headline: 'Two headline', url: 'https://two.test/story' },
    ],
  };

  await addToldToStories([story], failing('told'), failing('writer'), {
    warn(component, message) { warnings.push([component, message]); },
  });

  assert.deepStrictEqual(story.told, {
    outlets: story.outlet_versions.map(({ name, headline, url }) => ({ name, headline, url })),
  });
  assert.strictEqual(warnings.length, 2);
  assert.match(warnings[1][1], /using outlets only/i);
});
