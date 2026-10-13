'use strict';

const { EDIT_SCHEMA, editSystemPrompt, editUserPrompt } = require('./prompts');
const { validateEdit, deterministicEdit } = require('./validate');
const { costUsd } = require('./prices');

async function editStories(stories, writer, settings, log) {
  const options = {
    sectionSize: settings.getSectionSize(),
    topSize: settings.getTopSize(),
  };
  let edited;
  let stats = {
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    duration_ms: 0,
    edit_fallback: false,
  };

  try {
    const response = await writer.edit(
      editSystemPrompt(),
      editUserPrompt(stories, { sectionSize: options.sectionSize }),
      EDIT_SCHEMA
    );
    edited = validateEdit(response.json, stories, options);
    const usage = response.usage || {};
    stats = {
      input_tokens: Number(usage.input_tokens) || 0,
      output_tokens: Number(usage.output_tokens) || 0,
      cost_usd: costUsd(response.model || '', usage),
      duration_ms: Number(response.duration_ms) || 0,
      edit_fallback: false,
    };
    if (edited.problems.length > 0 && log && log.warn) {
      log.warn('pipeline:editor', 'Editor output needed repair', { problems: edited.problems });
    }
  } catch (error) {
    edited = deterministicEdit(stories, options);
    stats.edit_fallback = true;
    if (log && log.warn) {
      log.warn('pipeline:editor', `Editor failed, using deterministic order: ${error.message}`);
    }
  }

  const sectionCount = Object.values(edited.sections).reduce((total, ids) => total + ids.length, 0);
  if (log && log.info) log.info('pipeline:editor', `Edited: ${edited.top.length} top, ${sectionCount} in sections`);
  return {
    top: edited.top,
    sections: edited.sections,
    more: edited.more,
    stats,
  };
}

module.exports = { editStories };
