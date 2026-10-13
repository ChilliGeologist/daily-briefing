'use strict';

const { WRITE_SCHEMA, writeSystemPrompt, writeUserPrompt } = require('./prompts');
const { validateWrite } = require('./validate');
const { costUsd } = require('./prices');

function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

async function writeStories(items, writer, settings, log, emitProgress, checkCancelled) {
  const storiesByIndex = new Array(items.length);
  const droppedByIndex = new Array(items.length);
  const stats = {
    written: 0,
    fallbacks: 0,
    not_news: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    duration_ms: 0,
  };
  let cursor = 0;
  let completed = 0;
  if (emitProgress) emitProgress('write', 0, items.length);

  async function processItem(item, index) {
    if (checkCancelled) checkCancelled();
    const id = `s${index + 1}`;
    const rank = item.rank == null ? index + 1 : item.rank;
    let validation;
    let writtenBy = writer.name;

    try {
      const response = await writer.write(
        writeSystemPrompt(),
        writeUserPrompt(item, { articleChars: settings.getWriterArticleChars() }),
        WRITE_SCHEMA
      );
      writtenBy = response.backend || writer.name;
      const usage = response.usage || {};
      stats.input_tokens += Number(usage.input_tokens) || 0;
      stats.output_tokens += Number(usage.output_tokens) || 0;
      stats.duration_ms += Number(response.duration_ms) || 0;
      stats.cost_usd += costUsd(response.model || writtenBy.replace(/^[^:]+:/, ''), usage);
      validation = validateWrite(response.json, item);
      if (!validation.ok) {
        stats.fallbacks++;
        if (log && log.warn) {
          log.warn('pipeline:writer', `Writer output invalid for "${item.title}", using fallback`, {
            problems: validation.problems,
          });
        }
      }
    } catch (error) {
      validation = validateWrite(null, item);
      stats.fallbacks++;
      if (log && log.warn) {
        log.warn('pipeline:writer', `Writer failed for "${item.title}", using fallback: ${error.message}`);
      }
    }

    const story = {
      ...item,
      rank,
      id,
      ...validation.value,
      written_by: writtenBy,
      write_ok: validation.ok,
    };
    if (story.is_news) {
      storiesByIndex[index] = story;
    } else {
      droppedByIndex[index] = story;
      stats.not_news++;
      if (log && log.info) log.info('pipeline:writer', `Not news: "${item.title}"`);
    }
  }

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await processItem(items[index], index);
      completed++;
      if (emitProgress) emitProgress('write', completed, items.length);
    }
  }

  const concurrency = Math.min(4, Math.max(1, Number(writer.concurrency) || 1), Math.max(1, items.length));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const stories = storiesByIndex.filter(Boolean);
  const dropped = droppedByIndex.filter(Boolean);
  stats.written = stories.length;

  if (log && log.info) {
    log.info('pipeline:writer',
      `Wrote ${stories.length} stories: ${stats.fallbacks} ${plural(stats.fallbacks, 'fallback')}, ${stats.not_news} not news`);
  }
  return { stories, dropped, stats };
}

module.exports = { writeStories };
