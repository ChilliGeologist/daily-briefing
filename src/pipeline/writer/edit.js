'use strict';

const { editSchema, editSystemPrompt, editUserPrompt } = require('./prompts');
const { validateEdit, deterministicEdit } = require('./validate');

async function editStories(stories, writer, settings, log) {
  const options = {
    sectionSize: settings.getSectionSize(),
    topSize: settings.getTopSize(),
  };
  let edited;
  let stats = {
    input_tokens: 0,
    output_tokens: 0,
    duration_ms: 0,
    edit_fallback: 'none',
  };

  try {
    const response = await writer.edit(
      editSystemPrompt(),
      editUserPrompt(stories, { sectionSize: options.sectionSize }),
      editSchema(stories.map(story => story.id))
    );
    edited = validateEdit(response.json, stories, options);
    const usage = response.usage || {};
    stats = {
      input_tokens: Number(usage.input_tokens) || 0,
      output_tokens: Number(usage.output_tokens) || 0,
      duration_ms: Number(response.duration_ms) || 0,
      edit_fallback: edited.fallback,
    };
    if (edited.fallback === 'full' && log && log.warn) {
      log.warn('pipeline:editor', 'Editor output was unusable, using deterministic order', { problems: edited.problems });
    } else if (edited.fallback === 'partial' && log && log.info) {
      log.info('pipeline:editor', 'Editor output needed repair', { problems: edited.problems });
    }
  } catch (error) {
    edited = deterministicEdit(stories, options);
    stats.edit_fallback = 'full';
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
    problems: edited.problems || [],
    stats,
  };
}

module.exports = { editStories };
