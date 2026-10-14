'use strict';

const TIMEOUT_MS = 300000;

function createOllamaWriter({ url, model, numCtx, fetchImpl = globalThis.fetch, log }) {
  const endpoint = `${String(url).replace(/\/$/, '')}/api/chat`;

  async function call(system, user, schema, numPredict) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = Date.now();
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          format: schema,
          stream: false,
          think: false,
          keep_alive: '30m',
          options: { temperature: 0.3, num_ctx: numCtx, num_predict: numPredict },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Ollama HTTP ${response.status}: ${body.slice(0, 200)}`);
      }

      const body = await response.json();
      const content = body.message && body.message.content;
      const json = typeof content === 'string' ? JSON.parse(content) : content;
      const result = {
        json,
        usage: {
          input_tokens: body.prompt_eval_count ?? 0,
          output_tokens: body.eval_count ?? 0,
        },
        duration_ms: body.total_duration == null
          ? Date.now() - started
          : Math.round(body.total_duration / 1e6),
      };
      Object.defineProperty(result, 'model', { value: model, enumerable: false });
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    name: `ollama:${model}`,
    concurrency: 1,
    write(system, user, schema) {
      return call(system, user, schema, 700);
    },
    edit(system, user, schema) {
      return call(system, user, schema, 1500);
    },
  };
}

module.exports = { createOllamaWriter };
