'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const Anthropic = require('@anthropic-ai/sdk');
const { createWriter } = require('../src/pipeline/writer');

function settings(apiKey = 'key') {
  return {
    getWriter: () => 'anthropic',
    getAnthropicApiKey: () => apiKey,
    getAnthropicWriteModel: () => 'claude-haiku-4-5',
    getAnthropicEditModel: () => 'claude-sonnet-5-5',
    getOllamaUrl: () => 'http://ollama:11434',
    getWriterOllamaModel: () => 'qwen3:8b',
    getOllamaNumCtx: () => 8192,
  };
}

function anthropicResponse(value, usage = {}) {
  return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(value) }], usage };
}

function ollamaFetch(calls) {
  return async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return {
      ok: true,
      async json() {
        return { message: { content: '{"from":"ollama"}' }, prompt_eval_count: 4, eval_count: 1, total_duration: 2000000 };
      },
    };
  };
}

it('switches once after a mid-run connection failure and tracks both story writers', async () => {
  let anthropicCalls = 0;
  const ollamaCalls = [];
  const warnings = [];
  const client = { messages: { async create() {
    anthropicCalls++;
    if (anthropicCalls === 1) return anthropicResponse({ from: 'anthropic' }, { input_tokens: 10, output_tokens: 2 });
    throw new Anthropic.APIConnectionError({ message: 'socket closed' });
  } } };
  const writer = createWriter(settings(), { warn: (...args) => warnings.push(args) }, {
    anthropicClient: client,
    fetchImpl: ollamaFetch(ollamaCalls),
  });

  const first = await writer.write('s1', 'u1', {});
  const second = await writer.write('s2', 'u2', {});
  const third = await writer.write('s3', 'u3', {});

  assert.deepStrictEqual([first.json, first.backend, second.json, second.backend, third.json, third.backend], [
    { from: 'anthropic' }, 'anthropic:claude-haiku-4-5',
    { from: 'ollama' }, 'ollama:qwen3:8b',
    { from: 'ollama' }, 'ollama:qwen3:8b',
  ]);
  assert.strictEqual(anthropicCalls, 2);
  assert.strictEqual(ollamaCalls.length, 2);
  assert.deepStrictEqual(warnings, [[
    'pipeline:writer',
    'Anthropic unavailable (APIConnectionError: socket closed), using Ollama for the rest of this run',
  ]]);
  assert.deepStrictEqual(writer.usedBackends(), new Set(['anthropic:claude-haiku-4-5', 'ollama:qwen3:8b']));
  assert.deepStrictEqual(writer.usage(), {
    'claude-haiku-4-5': { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    'qwen3:8b': { input_tokens: 8, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  });
});

it('classifies network, 5xx, 429 and 401 errors as backend failures', async () => {
  const headers = new Headers();
  const failures = [
    new Anthropic.APIConnectionError({ message: 'network' }),
    new Anthropic.APIError(503, { message: 'server' }, undefined, headers),
    new Anthropic.RateLimitError(429, { message: 'quota' }, undefined, headers),
    new Anthropic.AuthenticationError(401, { message: 'bad key' }, undefined, headers),
  ];
  const outcomes = [];
  for (const failure of failures) {
    const warnings = [];
    let ollamaCalls = 0;
    const writer = createWriter(settings(), { warn: (_component, message) => warnings.push(message) }, {
      anthropicClient: { messages: { async create() { throw failure; } } },
      fetchImpl: async () => {
        ollamaCalls++;
        return { ok: true, async json() { return { message: { content: '{}' } }; } };
      },
    });
    const result = await writer.write('s', 'u', {});
    outcomes.push({ backend: result.backend, ollamaCalls, warnings });
  }
  assert.deepStrictEqual(outcomes, [
    { backend: 'ollama:qwen3:8b', ollamaCalls: 1, warnings: ['Anthropic unavailable (APIConnectionError: network), using Ollama for the rest of this run'] },
    { backend: 'ollama:qwen3:8b', ollamaCalls: 1, warnings: ['Anthropic unavailable (APIError: 503 server), using Ollama for the rest of this run'] },
    { backend: 'ollama:qwen3:8b', ollamaCalls: 1, warnings: ['Anthropic unavailable (RateLimitError: 429 quota), using Ollama for the rest of this run'] },
    { backend: 'ollama:qwen3:8b', ollamaCalls: 1, warnings: ['Anthropic unavailable (AuthenticationError: 401 bad key), using Ollama for the rest of this run'] },
  ]);
});

it('retries a bad request on Ollama without switching later stories', async () => {
  let anthropicCalls = 0;
  const warnings = [];
  const writer = createWriter(settings(), { warn: (...args) => warnings.push(args) }, {
    anthropicClient: { messages: { async create() {
      anthropicCalls++;
      if (anthropicCalls === 1) throw new Anthropic.BadRequestError(400, { message: 'story rejected' }, undefined, new Headers());
      return anthropicResponse({ from: 'anthropic' });
    } } },
    fetchImpl: ollamaFetch([]),
  });

  const first = await writer.write('s', 'u', {});
  const second = await writer.write('s', 'u', {});
  assert.deepStrictEqual([first.backend, second.backend, warnings], ['ollama:qwen3:8b', 'anthropic:claude-haiku-4-5', []]);
});

it('uses Ollama from the start and warns once when the key is missing', async () => {
  const warnings = [];
  const calls = [];
  const writer = createWriter(settings(null), { warn: (...args) => warnings.push(args) }, { fetchImpl: ollamaFetch(calls) });
  await writer.write('s', 'u', {});
  await writer.edit('s', 'u', {});
  assert.deepStrictEqual([calls.length, warnings], [2, [[
    'pipeline:writer',
    'Anthropic unavailable (MissingApiKeyError: anthropic_api_key is not set), using Ollama for the rest of this run',
  ]]]);
});
