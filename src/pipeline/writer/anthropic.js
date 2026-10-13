'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { modelPrice } = require('./prices');

class WriterOutputError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'WriterOutputError';
  }
}

function annotateModel(result, model) {
  Object.defineProperty(result, 'model', { value: model, enumerable: false });
  return result;
}

function createAnthropicWriter({ apiKey, writeModel, editModel, client, log, now = Date.now }) {
  const anthropic = client || new Anthropic({ apiKey, maxRetries: 2, timeout: 120000 });

  async function call(model, maxTokens, system, user, schema, useEffort) {
    const outputConfig = { format: { type: 'json_schema', schema } };
    if (useEffort) outputConfig.effort = 'low';
    const request = {
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: outputConfig,
    };
    const started = now();
    const response = await anthropic.messages.create(request);
    const duration_ms = now() - started;

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      throw new WriterOutputError(`Anthropic stopped with ${response.stop_reason}`);
    }
    const text = (response.content || []).find(block => block.type === 'text');
    if (!text) throw new WriterOutputError('Anthropic returned no text output');

    let json;
    try {
      json = JSON.parse(text.text);
    } catch (error) {
      throw new WriterOutputError('Anthropic returned invalid JSON', { cause: error });
    }

    const usage = response.usage || {};
    return annotateModel({
      json,
      usage: {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      },
      duration_ms,
    }, model);
  }

  return {
    name: `anthropic:${writeModel}`,
    concurrency: 4,
    write(system, user, schema) {
      return call(writeModel, 2000, system, user, schema, false);
    },
    edit(system, user, schema) {
      const price = modelPrice(editModel);
      return call(editModel, 4000, system, user, schema, Boolean(price && price.supportsEffort));
    },
  };
}

module.exports = { createAnthropicWriter, WriterOutputError };
