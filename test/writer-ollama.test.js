'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { createOllamaWriter } = require('../src/pipeline/writer/ollama');

function response(body, { ok = true, status = 200, text = '' } = {}) {
  return {
    ok,
    status,
    async json() { return body; },
    async text() { return text; },
  };
}

it('sends the exact structured write request with an explicit large context', async () => {
  const calls = [];
  const writer = createOllamaWriter({
    url: 'http://ollama:11434/',
    model: 'qwen3:8b',
    numCtx: 8192,
    fetchImpl: async (url, options) => {
      calls.push({
        url,
        method: options.method,
        headers: options.headers,
        body: JSON.parse(options.body),
        hasSignal: options.signal instanceof AbortSignal,
      });
      return response({
        message: { content: '{"answer":true}' },
        prompt_eval_count: 123,
        eval_count: 45,
        total_duration: 987000000,
      });
    },
    log: {},
  });
  const schema = { type: 'object' };

  assert.deepStrictEqual(await writer.write('system', 'user', schema), {
    json: { answer: true },
    usage: { input_tokens: 123, output_tokens: 45 },
    duration_ms: 987,
  });
  assert.strictEqual(writer.name, 'ollama:qwen3:8b');
  assert.strictEqual(writer.concurrency, 1);
  assert.deepStrictEqual(calls, [{
    url: 'http://ollama:11434/api/chat',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      model: 'qwen3:8b',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'user' },
      ],
      format: schema,
      stream: false,
      think: false,
      keep_alive: '30m',
      options: { temperature: 0.3, num_ctx: 8192, num_predict: 700 },
    },
    hasSignal: true,
  }]);
});

it('uses the larger edit output allowance', async () => {
  const bodies = [];
  const writer = createOllamaWriter({
    url: 'http://ollama:11434',
    model: 'gemma4:latest',
    numCtx: 16384,
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return response({ message: { content: '{}' }, prompt_eval_count: 1, eval_count: 2, total_duration: 3000000 });
    },
  });

  assert.deepStrictEqual(await writer.edit('edit system', 'edit user', { type: 'object' }), {
    json: {},
    usage: { input_tokens: 1, output_tokens: 2 },
    duration_ms: 3,
  });
  assert.deepStrictEqual(bodies[0].options, { temperature: 0.3, num_ctx: 16384, num_predict: 1500 });
});

it('throws a bounded error for a non-success response', async () => {
  const writer = createOllamaWriter({
    url: 'http://ollama:11434',
    model: 'qwen',
    numCtx: 8192,
    fetchImpl: async () => response(null, { ok: false, status: 503, text: 'x'.repeat(220) }),
  });

  await assert.rejects(
    writer.write('s', 'u', {}),
    { name: 'Error', message: `Ollama HTTP 503: ${'x'.repeat(200)}` }
  );
});
