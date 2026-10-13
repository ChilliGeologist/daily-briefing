'use strict';

const MODEL_PRICES = Object.freeze({
  'claude-haiku-4-5': Object.freeze({ input: 1, output: 5, supportsEffort: false }),
  'claude-sonnet-5-5': Object.freeze({ input: 2, output: 10, supportsEffort: true }),
  'claude-opus-5-5': Object.freeze({ input: 4, output: 20, supportsEffort: true }),
});

function modelPrice(model) {
  return MODEL_PRICES[model] || null;
}

function costUsd(model, usage = {}) {
  const price = modelPrice(model);
  if (!price) return 0;
  const input = Number(usage.input_tokens) || 0;
  const output = Number(usage.output_tokens) || 0;
  const cacheRead = Number(usage.cache_read_input_tokens) || 0;
  const cacheWrite = Number(usage.cache_creation_input_tokens) || 0;
  return (
    input * price.input
    + output * price.output
    + cacheRead * price.input * 0.1
    + cacheWrite * price.input * 1.25
  ) / 1000000;
}

module.exports = { MODEL_PRICES, modelPrice, costUsd };
