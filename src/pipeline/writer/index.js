'use strict';

const { createOllamaWriter } = require('./ollama');

function wrapWriter(writer) {
  const totals = {};

  function record(result) {
    const model = result.model || writer.name.replace(/^[^:]+:/, '');
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
    Object.defineProperty(result, 'backend', { value: writer.name, enumerable: false });
    return result;
  }

  return {
    name: writer.name,
    concurrency: writer.concurrency,
    write(system, user, schema) {
      return writer.write(system, user, schema).then(record);
    },
    vision(system, user, schema, imageUrl) {
      if (typeof writer.vision !== 'function') return Promise.reject(new Error('Writer has no vision support'));
      return writer.vision(system, user, schema, imageUrl).then(record);
    },
    tell(system, user, schema, numPredict) {
      const method = typeof writer.tell === 'function' ? writer.tell.bind(writer) : writer.write.bind(writer);
      return method(system, user, schema, numPredict).then(record);
    },
    edit(system, user, schema) {
      return writer.edit(system, user, schema).then(record);
    },
    unload() {
      return typeof writer.unload === 'function' ? writer.unload() : Promise.resolve();
    },
    usage() {
      return Object.fromEntries(Object.entries(totals).map(([model, usage]) => [model, { ...usage }]));
    },
  };
}

function createWriter(settings, log, deps = {}) {
  return wrapWriter(deps.ollamaWriter || createOllamaWriter({
    url: settings.getOllamaUrl(),
    model: settings.getWriterOllamaModel(),
    numCtx: settings.getOllamaNumCtx(),
    numThread: settings.getWriterNumThread(),
    fetchImpl: deps.fetchImpl,
    log,
  }));
}

function createToldWriter(settings, log, deps = {}) {
  return wrapWriter(deps.ollamaWriter || createOllamaWriter({
    url: settings.getOllamaUrl(),
    model: settings.getToldOllamaModel(),
    numCtx: settings.getOllamaNumCtx(),
    numThread: settings.getToldNumThread(),
    keepAlive: '5m',
    fetchImpl: deps.fetchImpl,
    log,
  }));
}

module.exports = { createWriter, createToldWriter };
