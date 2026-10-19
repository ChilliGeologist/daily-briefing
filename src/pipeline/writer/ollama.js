'use strict';

const TIMEOUT_MS = 300000;

function createOllamaWriter({
  url,
  model,
  numCtx,
  fetchImpl = globalThis.fetch,
  log,
  keepAlive = '30m',
  numThread,
}) {
  const baseUrl = String(url).replace(/\/$/, '');
  const endpoint = `${baseUrl}/api/chat`;

  async function call(system, user, schema, numPredict, images = []) {
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
            { role: 'user', content: user, ...(images.length > 0 ? { images } : {}) },
          ],
          format: schema,
          stream: false,
          think: false,
          keep_alive: keepAlive,
          options: {
            temperature: 0.3,
            num_ctx: numCtx,
            num_predict: numPredict,
            ...(numThread === undefined ? {} : { num_thread: numThread }),
          },
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
    async vision(system, user, schema, imageUrl) {
      const image = await fetchImpl(imageUrl);
      if (!image.ok) throw new Error(`Image HTTP ${image.status || 'error'}`);
      const bytes = Buffer.from(await image.arrayBuffer());
      return call(system, user, schema, 700, [bytes.toString('base64')]);
    },
    tell(system, user, schema, numPredict = 1200) {
      return call(system, user, schema, numPredict);
    },
    edit(system, user, schema) {
      return call(system, user, schema, 1500);
    },
    async unload() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetchImpl(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, keep_alive: 0 }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Ollama unload HTTP ${response.status}: ${body.slice(0, 200)}`);
        }
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

module.exports = { createOllamaWriter };
