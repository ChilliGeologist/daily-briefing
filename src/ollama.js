'use strict';

const TIMEOUT_MS = 300000;

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${body.substring(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function generate(url, model, prompt, options) {
  // Use chat endpoint with think:false to avoid reasoning token overhead
  const body = await fetchWithTimeout(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      think: false,
      keep_alive: '30m',
      options: { num_predict: 500, temperature: 0.3, ...options },
    }),
  });

  return {
    response: body.message.content,
    tokens: body.eval_count || 0,
    duration_ms: Math.round((body.total_duration || 0) / 1e6),
  };
}

async function chat(url, model, messages, options) {
  const body = await fetchWithTimeout(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      think: false,
      keep_alive: '30m',
      options: { num_predict: 500, temperature: 0.3, ...options },
    }),
  });

  return {
    response: body.message.content,
    tokens: body.eval_count || 0,
    duration_ms: Math.round((body.total_duration || 0) / 1e6),
  };
}

async function listModels(url) {
  const body = await fetchWithTimeout(`${url}/api/tags`, {
    method: 'GET',
  });

  return (body.models || []).map(m => ({
    name: m.name,
    size: m.size,
    parameter_size: m.details ? m.details.parameter_size : undefined,
    quantization: m.details ? m.details.quantization_level : undefined,
  }));
}

async function testConnection(url) {
  try {
    const models = await listModels(url);
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { generate, chat, listModels, testConnection };
