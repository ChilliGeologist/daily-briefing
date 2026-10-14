'use strict';

const { WRITE_SCHEMA, isCommunityItem, writeSystemPrompt, writeUserPrompt } = require('./prompts');
const { validateWrite } = require('./validate');

function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

async function writeStories(items, writer, settings, log, emitProgress, checkCancelled) {
  const storiesByIndex = new Array(items.length);
  const droppedByIndex = new Array(items.length);
  const stats = {
    written: 0,
    repairs: 0,
    fallbacks: 0,
    not_news: 0,
    not_news_overridden: 0,
    section_moves: 0,
    facts_removed: 0,
    numbers_unsupported: 0,
    input_tokens: 0,
    output_tokens: 0,
    duration_ms: 0,
  };
  const interests = typeof settings.getInterests === 'function' ? settings.getInterests() : undefined;
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
      validation = validateWrite(response.json, item, interests);
      stats.facts_removed += validation.facts_removed || 0;
      stats.numbers_unsupported += validation.numbers_unsupported || 0;
      if (!validation.value.is_news
        && !isCommunityItem(item)
        && String(item.article_content || '').trim().length < 500) {
        validation.value.is_news = true;
        validation.problems.push('kept: no article text, not-news ignored');
        stats.not_news_overridden++;
      }
      if (!validation.ok) {
        stats.fallbacks++;
        if (log && log.warn) {
          log.warn('pipeline:writer', `Writer output invalid for "${item.title}", using fallback`, {
            problems: validation.problems,
          });
        }
      }
      if (validation.ok && validation.problems.length > 0) stats.repairs++;
    } catch (error) {
      validation = validateWrite(null, item, interests);
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
      write_problems: validation.problems,
    };
    if (validation.sectionMoved) {
      stats.section_moves++;
      if (log && log.debug) {
        log.debug('pipeline:writer', validation.problems.at(-1));
      }
    }
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
      `Wrote ${stories.length} stories: ${stats.repairs} ${plural(stats.repairs, 'repair')}, ${stats.fallbacks} ${plural(stats.fallbacks, 'fallback')}, ${stats.not_news} not news, ${stats.not_news_overridden} ${plural(stats.not_news_overridden, 'not-news override')}, ${stats.section_moves} ${plural(stats.section_moves, 'section move')}, ${stats.facts_removed} ${plural(stats.facts_removed, 'fact', 'facts')} removed, ${stats.numbers_unsupported} unsupported ${plural(stats.numbers_unsupported, 'number')}`);
  }
  return { stories, dropped, stats };
}

module.exports = { writeStories };
