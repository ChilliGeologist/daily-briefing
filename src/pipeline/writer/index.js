'use strict';

const { createOllamaWriter } = require('./ollama');

function createWriter(settings, log, deps = {}) {
  const writer = deps.ollamaWriter || createOllamaWriter({
    url: settings.getOllamaUrl(),
    model: settings.getWriterOllamaModel(),
    numCtx: settings.getOllamaNumCtx(),
    fetchImpl: deps.fetchImpl,
    log,
  });
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
    edit(system, user, schema) {
      return writer.edit(system, user, schema).then(record);
    },
    usage() {
      return Object.fromEntries(Object.entries(totals).map(([model, usage]) => [model, { ...usage }]));
    },
  };
}

module.exports = { createWriter };
