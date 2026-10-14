'use strict';

const { WRITE_SCHEMA, isCommunityItem, writeSystemPrompt, writeUserPrompt } = require('./prompts');
const {
  isVagueHeadline,
  isCommunityHelpRequest,
  isUnansweredCommunityQuestion,
  missingTextFields,
  validateWrite,
} = require('./validate');

const MISSING_TEXT_RETRY_NOTE = 'Rewrite any affected summary, detail or kicker as plain news from the headline and teasers. Never mention missing, absent, unavailable or unprovided text, content, information or details. Write complete sentences that make sense alone.';

// Clickbait that only an article could explain ("Huge update after boy shot
// dead"); with nothing but the headline it tells the reader nothing.
const CLICKBAIT = /\b(?:huge update|bombshell|you won['’]?t believe|here['’]?s why|what we know)\b/i;

// True when the app has nothing but the headline: no article text, and every
// teaser is just the headline again plus the outlet's name (Google News).
// Reddit link and photo posts have no body either, but are written from their
// comment threads, so only news outlets qualify.
function isHeadlineOnly(item) {
  if (isCommunityItem(item)) return false;
  if (String(item.article_content || '').trim().length >= 200) return false;
  const names = [item.source_name, item.outlet, item.publisher]
    .filter(value => typeof value === 'string')
    // "The Mercury (Google News)" signs its teasers "The Mercury".
    .flatMap(value => [value, value.replace(/\s*\([^)]*\)\s*$/, '')]);
  const strip = text => [item.title, ...names]
    .filter(value => typeof value === 'string' && value.trim())
    .reduce((rest, value) => rest.split(value.trim()).join(' '), String(text || ''))
    .replace(/[\s\p{P}]+/gu, ' ').trim();
  const teasers = [item.description, ...(Array.isArray(item.merged_descriptions) ? item.merged_descriptions : [])];
  return teasers.every(text => strip(text).length === 0);
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

function firstSentence(item) {
  const teaser = String(item.description || item.merged_descriptions?.[0] || '').trim();
  const match = teaser.match(/^.*?[.!?](?=\s|$)/s);
  return (match ? match[0] : teaser).slice(0, 200).trim();
}

function isQuoteOnlyHeadline(headline) {
  return /^\s*["“‘][^"”’]+["”’](?:\s*(?:[-–—]{1,2}\s*)?[\p{L}][^.]*)?\s*$/u.test(String(headline || ''));
}

function headlineRetryReason(headline, item) {
  if (isVagueHeadline(headline)) return 'too vague';
  // A rewrite of a long publisher headline once said the opposite of the
  // story (an IMF piece); a long headline beats a wrong one, so only Reddit and
  // HN titles are shortened.
  if (isCommunityItem(item) && (String(headline || '').trim().match(/\S+/g) || []).length > 18) {
    return 'longer than 18 words';
  }
  if (isCommunityItem(item) && isQuoteOnlyHeadline(headline)) return 'only a quote';
  return null;
}

function applyMissingTextFallback(validation, item) {
  const fields = validation.missingTextFields || [];
  if (fields.length === 0) return;
  const teaser = firstSentence(item);
  validation.problems.push('Missing-text retry still referred to unavailable source text');
  for (const field of ['summary', 'detail']) {
    if (!fields.includes(field)) continue;
    const label = `${field[0].toUpperCase()}${field.slice(1)}`;
    // Keep the sentences that are real news; drop only the ones about the text.
    const kept = (String(validation.value[field]).match(/[^.!?]+(?:[.!?]+|$)/g) || [])
      .map(sentence => sentence.trim())
      .filter(sentence => sentence && missingTextFields({ [field]: sentence }).length === 0)
      .join(' ');
    if (kept) {
      validation.value[field] = kept;
      validation.problems.push(`${label}: sentences about unavailable text removed`);
    } else {
      validation.value[field] = teaser;
      validation.problems.push(teaser
        ? `${label} replaced with the first teaser sentence`
        : `${label} left empty because no teaser was available`);
    }
  }
}

async function writeStories(items, writer, settings, log, emitProgress, checkCancelled) {
  const storiesByIndex = new Array(items.length);
  const droppedByIndex = new Array(items.length);
  const stats = {
    written: 0,
    repairs: 0,
    headline_retries: 0,
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

    async function request(prompt) {
      const response = await writer.write(writeSystemPrompt(), prompt, WRITE_SCHEMA);
      const usage = response.usage || {};
      stats.input_tokens += Number(usage.input_tokens) || 0;
      stats.output_tokens += Number(usage.output_tokens) || 0;
      stats.duration_ms += Number(response.duration_ms) || 0;
      return { validation: validateWrite(response.json, item, interests), backend: response.backend || writer.name };
    }
    const overrideNotNews = !isCommunityItem(item)
      && String(item.article_content || '').trim().length < 500;
    const headlineOnly = isHeadlineOnly(item);

    try {
      const userPrompt = writeUserPrompt(item, { articleChars: settings.getWriterArticleChars() });
      const first = await request(userPrompt);
      validation = first.validation;
      writtenBy = first.backend;
      if (!headlineOnly && validation.ok && (validation.value.is_news || overrideNotNews)
        && (validation.missingTextFields || []).length > 0) {
        try {
          const retry = await request(`${userPrompt}\n\n${MISSING_TEXT_RETRY_NOTE}`);
          if (retry.validation.ok) {
            validation = retry.validation;
            writtenBy = retry.backend;
          } else {
            validation.problems.push('Missing-text retry was invalid');
          }
        } catch (error) {
          validation.problems.push(`Missing-text retry failed: ${error.message}`);
        }
        applyMissingTextFallback(validation, item);
      }
      const retryReason = !headlineOnly && validation.ok && (validation.value.is_news || overrideNotNews)
        ? headlineRetryReason(validation.value.headline, item)
        : null;
      if (retryReason) {
        stats.headline_retries++;
        const note = `Headline "${validation.value.headline}" is ${retryReason}; write a specific headline of 6–14 words saying what happened, from the supplied text only.`;
        try {
          const retry = await request(`${userPrompt}\n\n${note}`);
          if (!retry.validation.ok) {
            validation.problems.push('Headline retry was invalid');
          } else if (headlineRetryReason(retry.validation.value.headline, item)) {
            const stillReason = headlineRetryReason(retry.validation.value.headline, item);
            validation.problems.push(stillReason === 'too vague'
              ? `Headline retry was still vague: "${retry.validation.value.headline}"`
              : `Headline retry was still unsuitable: "${retry.validation.value.headline}"`);
          } else if ((retry.validation.missingTextFields || []).length > 0) {
            validation.problems.push('Headline retry referred to unavailable source text');
          } else {
            validation = retry.validation;
            writtenBy = retry.backend;
          }
        } catch (error) {
          validation.problems.push(`Headline retry failed: ${error.message}`);
        }
      }
      stats.facts_removed += validation.facts_removed || 0;
      stats.numbers_unsupported += validation.numbers_unsupported || 0;
      if (isCommunityHelpRequest(item) && validation.value.is_news) {
        validation.value.is_news = false;
        validation.problems.push('not news: community help or buying request');
      }
      if (isUnansweredCommunityQuestion(item) && validation.value.is_news) {
        validation.value.is_news = false;
        validation.problems.push('not news: community question has fewer than two real replies');
      }
      if (!validation.value.is_news && overrideNotNews
        && !(headlineOnly && CLICKBAIT.test(validation.value.headline))) {
        validation.value.is_news = true;
        validation.problems.push('kept: no article text, not-news ignored');
        stats.not_news_overridden++;
      }
      if (headlineOnly) {
        // Anything written beyond the headline would be made up.
        validation.value.summary = '';
        validation.value.detail = '';
        validation.problems.push('headline only: summary and detail left empty');
        if (validation.value.is_news && CLICKBAIT.test(validation.value.headline)) {
          validation.value.is_news = false;
          validation.problems.push('not news: clickbait headline with no article text');
        }
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
        log.debug('pipeline:writer', validation.problems.find(problem => problem.startsWith('section moved:')));
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
      `Wrote ${stories.length} stories: ${stats.repairs} ${plural(stats.repairs, 'repair')}, ${stats.headline_retries} ${plural(stats.headline_retries, 'headline retry', 'headline retries')}, ${stats.fallbacks} ${plural(stats.fallbacks, 'fallback')}, ${stats.not_news} not news, ${stats.not_news_overridden} ${plural(stats.not_news_overridden, 'not-news override')}, ${stats.section_moves} ${plural(stats.section_moves, 'section move')}, ${stats.facts_removed} ${plural(stats.facts_removed, 'fact', 'facts')} removed, ${stats.numbers_unsupported} unsupported ${plural(stats.numbers_unsupported, 'number')}`);
  }
  return { stories, dropped, stats };
}

module.exports = { writeStories };
