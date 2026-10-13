'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { createAnthropicWriter, WriterOutputError } = require('../src/pipeline/writer/anthropic');
const { MODEL_PRICES, costUsd } = require('../src/pipeline/writer/prices');

it('sends the exact write and edit request shapes and reads usage', async () => {
  const calls = [];
  const responses = [
    {
      content: [{ type: 'text', text: '{"headline":"Written"}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 80, cache_creation_input_tokens: 10 },
    },
    {
      content: [{ type: 'text', text: '{"top":["s1"]}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 30, output_tokens: 5 },
    },
  ];
  const times = [1000, 1125, 2000, 2250];
  const writer = createAnthropicWriter({
    apiKey: 'test-key',
    writeModel: 'claude-haiku-4-5',
    editModel: 'claude-sonnet-5-5',
    client: { messages: { async create(request) { calls.push(request); return responses.shift(); } } },
    now: () => times.shift(),
  });
  const schema = { type: 'object' };

  assert.deepStrictEqual(await writer.write('write system', 'write user', schema), {
    json: { headline: 'Written' },
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 80, cache_creation_input_tokens: 10 },
    duration_ms: 125,
  });
  assert.deepStrictEqual(await writer.edit('edit system', 'edit user', schema), {
    json: { top: ['s1'] },
    usage: { input_tokens: 30, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    duration_ms: 250,
  });
  assert.strictEqual(writer.name, 'anthropic:claude-haiku-4-5');
  assert.strictEqual(writer.concurrency, 4);
  assert.deepStrictEqual(calls, [
    {
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      system: [{ type: 'text', text: 'write system', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'write user' }],
      output_config: { format: { type: 'json_schema', schema } },
    },
    {
      model: 'claude-sonnet-5-5',
      max_tokens: 4000,
      system: [{ type: 'text', text: 'edit system', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'edit user' }],
      output_config: { format: { type: 'json_schema', schema }, effort: 'low' },
    },
  ]);
});

it('does not send effort to a Haiku edit model', async () => {
  const calls = [];
  const writer = createAnthropicWriter({
    apiKey: 'key',
    writeModel: 'claude-haiku-4-5',
    editModel: 'claude-haiku-4-5',
    client: { messages: { async create(request) { calls.push(request); return { content: [{ type: 'text', text: '{}' }], usage: {} }; } } },
    now: () => 0,
  });
  await writer.edit('s', 'u', {});
  assert.deepStrictEqual(calls[0].output_config, { format: { type: 'json_schema', schema: {} } });
});

it('turns refusals, token exhaustion and malformed JSON into WriterOutputError', async () => {
  const responses = [
    { stop_reason: 'refusal', content: [], usage: {} },
    { stop_reason: 'max_tokens', content: [], usage: {} },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'junk' }], usage: {} },
  ];
  const writer = createAnthropicWriter({
    apiKey: 'key',
    writeModel: 'claude-haiku-4-5',
    editModel: 'claude-sonnet-5-5',
    client: { messages: { async create() { return responses.shift(); } } },
  });
  const messages = [];
  for (let index = 0; index < 3; index++) {
    try { await writer.write('s', 'u', {}); } catch (error) {
      assert.strictEqual(error instanceof WriterOutputError, true);
      messages.push(error.message);
    }
  }
  assert.deepStrictEqual(messages, [
    'Anthropic stopped with refusal',
    'Anthropic stopped with max_tokens',
    'Anthropic returned invalid JSON',
  ]);
});

it('prices known models and treats Ollama and unknown models as free', () => {
  assert.deepStrictEqual(MODEL_PRICES, {
    'claude-haiku-4-5': { input: 1, output: 5, supportsEffort: false },
    'claude-sonnet-5-5': { input: 2, output: 10, supportsEffort: true },
    'claude-opus-5-5': { input: 4, output: 20, supportsEffort: true },
  });
  const usage = {
    input_tokens: 1000000,
    output_tokens: 1000000,
    cache_read_input_tokens: 1000000,
    cache_creation_input_tokens: 1000000,
  };
  assert.deepStrictEqual([
    costUsd('claude-haiku-4-5', usage),
    costUsd('claude-sonnet-5-5', usage),
    costUsd('claude-opus-5-5', usage),
    costUsd('ollama:qwen3:8b', usage),
    costUsd('unknown', usage),
  ], [7.35, 14.7, 29.4, 0, 0]);
});
