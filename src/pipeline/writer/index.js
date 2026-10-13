'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { createOllamaWriter } = require('./ollama');
const { createAnthropicWriter, WriterOutputError } = require('./anthropic');

function backendFailure(error) {
  return error instanceof Anthropic.APIConnectionError
    || error instanceof Anthropic.APIConnectionTimeoutError
    || error instanceof Anthropic.AuthenticationError
    || error instanceof Anthropic.PermissionDeniedError
    || error instanceof Anthropic.RateLimitError
    || error instanceof Anthropic.InternalServerError
    || (error instanceof Anthropic.APIError && Number(error.status) >= 500);
}

function storyFailure(error) {
  return error instanceof Anthropic.BadRequestError || error instanceof WriterOutputError;
}

function createWriter(settings, log, deps = {}) {
  const ollama = deps.ollamaWriter || createOllamaWriter({
    url: settings.getOllamaUrl(),
    model: settings.getWriterOllamaModel(),
    numCtx: settings.getOllamaNumCtx(),
    fetchImpl: deps.fetchImpl,
    log,
  });
  const configured = settings.getWriter();
  const apiKey = settings.getAnthropicApiKey();
  let anthropic = null;
  if (configured === 'anthropic' && apiKey) {
    anthropic = deps.anthropicWriter || createAnthropicWriter({
      apiKey,
      writeModel: settings.getAnthropicWriteModel(),
      editModel: settings.getAnthropicEditModel(),
      client: deps.anthropicClient || deps.client,
      log,
      now: deps.now,
    });
  }

  let active = anthropic || ollama;
  let ollamaTail = Promise.resolve();
  let warned = false;
  const used = new Set();
  const totals = {};

  function warnUnavailable(className, message) {
    if (warned) return;
    warned = true;
    if (log && typeof log.warn === 'function') {
      log.warn('pipeline:writer',
        `Anthropic unavailable (${className}: ${message}), using Ollama for the rest of this run`);
    }
  }

  if (configured === 'anthropic' && !apiKey) {
    warnUnavailable('MissingApiKeyError', 'anthropic_api_key is not set');
  }

  function record(result, backend, method) {
    const model = result.model || backend.name.replace(/^[^:]+:/, '');
    if (!totals[model]) {
      totals[model] = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      };
    }
    for (const key of Object.keys(totals[model])) {
      totals[model][key] += Number(result.usage && result.usage[key]) || 0;
    }
    if (method === 'write') used.add(backend.name);
    Object.defineProperty(result, 'backend', { value: backend.name, enumerable: false });
    return result;
  }

  function callOllama(method, args) {
    const pending = ollamaTail.then(() => ollama[method](...args));
    ollamaTail = pending.catch(() => {});
    return pending;
  }

  async function call(method, args) {
    if (active === ollama) return record(await callOllama(method, args), ollama, method);

    try {
      return record(await anthropic[method](...args), anthropic, method);
    } catch (error) {
      if (storyFailure(error)) {
        return record(await callOllama(method, args), ollama, method);
      }
      if (backendFailure(error)) {
        warnUnavailable(error.constructor.name, error.message);
        active = ollama;
        return record(await callOllama(method, args), ollama, method);
      }
      throw error;
    }
  }

  return {
    name: active.name,
    concurrency: active.concurrency,
    write(system, user, schema) {
      return call('write', [system, user, schema]);
    },
    edit(system, user, schema) {
      return call('edit', [system, user, schema]);
    },
    usedBackends() {
      return new Set(used);
    },
    usage() {
      return Object.fromEntries(Object.entries(totals).map(([model, usage]) => [model, { ...usage }]));
    },
  };
}

module.exports = { createWriter, backendFailure };
