'use strict';

const { tokenize } = require('../cluster');
const { WRITE_SCHEMA, communityReplies, isCommunityItem, photoUserPrompt, writeSystemPrompt, writeUserPrompt } = require('./prompts');
const {
  isVagueHeadline,
  isCommunityHelpRequest,
  isUnansweredCommunityQuestion,
  missingTextFields,
  isNonNewsEssay,
  isProtectedGamingNews,
  isProjectPost,
  projectDropReason,
  isSportStory,
  sportDropReason,
  writingRetryReasons,
  validateWrite,
} = require('./validate');

const MISSING_TEXT_RETRY_NOTE = 'Rewrite any affected summary or kicker as plain news from the headline and teasers. Never mention missing, absent, unavailable or unprovided text, content, information or details. Write complete sentences that make sense alone.';
const SAME_EVENT_SIMILARITY = 0.4;
const SAME_EVENT_MIN_SHARED_WORDS = 5;
const HEADLINE_ECHO_SIMILARITY = 0.8;
const HEADLINE_ECHO_MIN_SHARED_WORDS = 4;
const HEADLINE_ECHO_PADDING = new Set(['report', 'reportedly']);

function countWords(text) {
  return (String(text || '').trim().match(/\S+/g) || []).length;
}

function hasUsablePhoto(item) {
  const values = [...(Array.isArray(item.images) ? item.images : []), item.image];
  return values.some(value => {
    try { return /^https?:$/.test(new URL(value).protocol); } catch (_) { return false; }
  });
}

function validUrl(value) {
  try { return new URL(value); } catch (_) { return null; }
}

function isRedditOwnedImage(value) {
  const parsed = validUrl(value);
  return Boolean(parsed && /^(?:i\.redd\.it|preview\.redd\.it|i\.imgur\.com)$/i.test(parsed.hostname));
}

function inferredExternalUrl(item) {
  if (item.external_url) return item.external_url;
  const description = String(item.description || '').trim();
  return /^https?:\/\/\S+$/i.test(description) ? description : null;
}

function isRedditLinkPost(item) {
  if (String(item.source_type || '').toLowerCase() !== 'reddit') return false;
  const external = inferredExternalUrl(item);
  if (!external) return false;
  const parsed = validUrl(external);
  if (!parsed) return false;
  return !/(?:^|\.)reddit\.com$/i.test(parsed.hostname) && !isRedditOwnedImage(external);
}

function isRedditPhotoPost(item) {
  if (String(item.source_type || '').toLowerCase() !== 'reddit' || isRedditLinkPost(item)) return false;
  const postUrl = validUrl(item.url);
  const gallery = Boolean(postUrl && /\/gallery\//i.test(postUrl.pathname));
  return [...(Array.isArray(item.images) ? item.images : []), item.image].some(value => {
    const parsed = validUrl(value);
    if (!parsed) return false;
    if (/^(?:i\.redd\.it|i\.imgur\.com)$/i.test(parsed.hostname)) return true;
    return parsed.hostname.toLowerCase() === 'preview.redd.it' && (gallery || !inferredExternalUrl(item));
  });
}

const ROUNDUP_PREFIX = /^(?:Morning Mail|Afternoon Update|Evening Update|Morning Update|First Edition|Weekend Reading|The Briefing|News Briefing)\b/i;
const ROUNDUP_CATEGORIES = /\b(?:Business|Health|Entertainment|Community|Sport|Basketball|Politics|Courts and Crime|Local Council|Road Incidents|Wildlife|The Latest)(?=[A-Z])/g;

function isMultiStoryRoundup(item) {
  const title = String(item.title || '').trim();
  if (ROUNDUP_PREFIX.test(title) || (title.match(/;/g) || []).length >= 2) return true;
  const external = validUrl(inferredExternalUrl(item));
  if (String(item.source_type || '').toLowerCase() !== 'reddit' || !external || external.pathname !== '/') return false;
  const categoryRuns = String(item.article_content || '').match(ROUNDUP_CATEGORIES) || [];
  return categoryRuns.length >= 3 || /\b(?:breaking news|top stories)\b/i.test(title);
}

function isAdvertorial(item) {
  const title = String(item.title || '');
  const copy = `${title}\n${item.description || ''}`;
  if (/^Cooking with\s+\S+/i.test(title)) return true;
  if (/\b(?:sponsored|in partnership with|brought to you by|paid partnership|advertorial)\b/i.test(copy)) return true;
  const urls = [item.url, item.canonical_url, item.external_url, item.article_url];
  return urls.some(raw => {
    const parsed = validUrl(raw);
    return Boolean(parsed && /\/(?:sponsored|branded|partner-content|advertorial)(?:\/|$)/i.test(parsed.pathname));
  });
}

function distinctOutletCount(item) {
  const names = (item.sources || []).map(source => String(source && source.name || '').trim().toLowerCase()).filter(Boolean);
  if (names.length === 0 && item.source_name) names.push(String(item.source_name).trim().toLowerCase());
  return new Set(names).size;
}

function preWriteDropReason(item, { ignorePhoto = false } = {}) {
  if (item.source_kind === 'warning' || item.source_kind === 'release') return null;
  if (isProtectedGamingNews(item)) return null;
  const title = String(item.title || '');
  const url = String(item.canonical_url || item.url || '');
  const sourceNames = [item.source_name, ...(item.sources || []).map(source => source && source.name)]
    .filter(Boolean).join('\n');
  if (/^live:/i.test(title.trim())) return 'live blog';
  const isGuardian = /(?:^|\.)theguardian\.com$/i.test((() => {
    try { return new URL(url).hostname; } catch (_) { return ''; }
  })()) || /\bGuardian\b/i.test(sourceNames);
  if (isGuardian && (/\/live\//i.test(url) || /[–—-]\s*live\s*$/i.test(title))) return 'Guardian live blog';
  if (isMultiStoryRoundup(item)) return 'multi-story round-up';
  if (isAdvertorial(item)) return 'advertorial';
  const articleWords = countWords(item.article_content);
  const replyCount = Number(item.real_reply_count) || communityReplies(item).length;
  const discussion = isCommunityItem(item) && !isRedditLinkPost(item) && replyCount >= 3;
  const photo = !ignorePhoto && hasUsablePhoto(item);
  const photoPost = photo && isRedditPhotoPost(item);
  if (articleWords < 40 && !discussion && !photoPost) return 'nothing behind headline';
  if (distinctOutletCount(item) <= 1 && articleWords < 150 && !discussion && !photoPost && !item.short_ok) {
    return 'single-outlet teaser under 150 words';
  }
  return null;
}

function isPhotoSubstance(item) {
  return isRedditPhotoPost(item)
    && countWords(item.description) < 40;
}

function isPageDescription(value) {
  return /\b(?:no substantial news content|promotional material|subscrib(?:e|er|ing|tion)|membership|this article|this page|the page)\b/i.test(String(value && value.summary || ''));
}

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

function headlineSummaryOverlap(headline, summary) {
  const headlineWords = new Set(tokenize(headline));
  const summaryWords = new Set(tokenize(summary).filter(word => !HEADLINE_ECHO_PADDING.has(word)));
  const shared = [...summaryWords].filter(word => headlineWords.has(word)).length;
  return {
    score: summaryWords.size === 0 ? 0 : shared / summaryWords.size,
    shared,
    summaryWords: summaryWords.size,
  };
}

function isUnrelatedShortSummary(value) {
  return (String(value?.summary || '').trim().match(/\S+/g) || []).length < 8
    && headlineSummaryOverlap(value?.headline, value?.summary).shared === 0;
}

function markUnrelatedShortSummary(validation) {
  if (!validation.ok || !isUnrelatedShortSummary(validation.value)) return;
  validation.missingTextFields = [...new Set([
    ...(validation.missingTextFields || []),
    'summary',
  ])];
}

function isLowTextHeadlineEcho(item, value) {
  if (String(item.article_content || '').trim().length >= 500) return false;
  const overlap = headlineSummaryOverlap(value.headline, value.summary);
  return overlap.shared >= HEADLINE_ECHO_MIN_SHARED_WORDS
    && overlap.score >= HEADLINE_ECHO_SIMILARITY;
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
  if (!fields.includes('summary')) return;
  // Keep the sentences that are real news; drop only the ones about the text.
  const kept = isUnrelatedShortSummary(validation.value)
    ? ''
    : String(validation.value.summary).split(/(?<=[.!?])\s+/u)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence && missingTextFields({ summary: sentence }).length === 0)
      .join(' ');
  if (kept) {
    validation.value.summary = kept;
    validation.problems.push('Summary: sentences about unavailable text removed');
  } else {
    validation.value.summary = teaser;
    if (teaser) {
      validation.problems.push('Summary replaced with the first teaser sentence');
    } else {
      validation.value.is_news = false;
      validation.problems.push('not news: nothing beyond the headline');
    }
  }
}

function gamingTitleFallback(title) {
  const text = String(title || '').trim().replace(/[.!?]+$/u, '');
  const roster = text.match(/^(.+?)\s+joins\s+(.+)$/i);
  if (roster) return `${roster[1]} has joined ${roster[2]}.`;
  const update = text.match(/^Dota\s+2\s+Update\s+for\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/i);
  if (update) return `Valve released a Dota 2 update on ${Number(update[2])} ${update[1]} ${update[3]}.`;
  return text ? `${text}.` : '';
}

function stripCommentOnlySentences(summary) {
  return String(summary || '').split(/(?<=[.!?])\s+/u)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence && !/\bcomments?\b.*\b(?:unrelated|off[ -]?topic|varied)\b/i.test(sentence))
    .join(' ');
}

function writtenContentWords(story) {
  const sourceTeasers = [story.title, story.description, ...(Array.isArray(story.merged_descriptions) ? story.merged_descriptions : [])];
  return new Set(tokenize([story.headline, story.summary, ...sourceTeasers].filter(Boolean).join(' ')).map(word => (
    /^(?:death|die|dies|died)$/.test(word) ? 'death' : word
  )));
}

function writtenStorySimilarity(left, right) {
  const leftWords = writtenContentWords(left);
  const rightWords = writtenContentWords(right);
  const shared = [...leftWords].filter(word => rightWords.has(word)).length;
  const smaller = Math.min(leftWords.size, rightWords.size);
  return { score: smaller === 0 ? 0 : shared / smaller, shared };
}

function mergeSources(keeper, duplicate) {
  const sources = [...(keeper.sources || []), ...(duplicate.sources || [])];
  const seen = new Set();
  keeper.sources = sources.filter(source => {
    const key = `${String(source?.name || '')}\u0000${String(source?.url || '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dropWrittenDuplicates(stories, log) {
  const ranked = stories.map((story, index) => ({ story, index }))
    .sort((a, b) => (Number(a.story.rank) - Number(b.story.rank)) || (a.index - b.index));
  const kept = [];
  const dropped = [];
  const droppedIds = new Set();

  for (const entry of ranked) {
    const duplicate = kept.find(candidate => {
      if (candidate.story.section !== entry.story.section) return false;
      const similarity = writtenStorySimilarity(candidate.story, entry.story);
      return similarity.shared >= SAME_EVENT_MIN_SHARED_WORDS
        && similarity.score >= SAME_EVENT_SIMILARITY;
    });
    if (!duplicate) {
      kept.push(entry);
      continue;
    }

    mergeSources(duplicate.story, entry.story);
    entry.story.is_news = false;
    entry.story.duplicate_of = duplicate.story.id;
    entry.story.write_problems.push(`duplicate: same event as ${duplicate.story.id}`);
    dropped.push(entry.story);
    droppedIds.add(entry.story.id);
    if (log && log.info) {
      log.info('pipeline:writer', `Duplicate event: "${entry.story.title}" merged into ${duplicate.story.id}`);
    }
  }

  return {
    stories: stories.filter(story => !droppedIds.has(story.id)),
    dropped,
  };
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
    let imageDescribed = false;

    function dropWithoutWriting(reason) {
      droppedByIndex[index] = {
        ...item,
        rank,
        id,
        is_news: false,
        headline: item.title || '',
        summary: '',
        kicker: '',
        section: 'australia',
        written_by: writtenBy,
        write_ok: true,
        write_problems: [`not news: ${reason}`],
      };
      stats.not_news++;
      if (log && log.info) log.info('pipeline:writer', `Not news: "${item.title}" (${reason})`);
    }

    if (Array.isArray(item.outlet_versions)) {
      const earlyReason = preWriteDropReason(item) || projectDropReason(item);
      if (earlyReason) {
        dropWithoutWriting(earlyReason);
        return;
      }
    }

    async function request(prompt, { vision = false } = {}) {
      const response = vision
        ? await writer.vision(writeSystemPrompt(), prompt, WRITE_SCHEMA, item.images?.[0] || item.image)
        : await writer.write(writeSystemPrompt(), prompt, WRITE_SCHEMA);
      const usage = response.usage || {};
      stats.input_tokens += Number(usage.input_tokens) || 0;
      stats.output_tokens += Number(usage.output_tokens) || 0;
      stats.duration_ms += Number(response.duration_ms) || 0;
      const checked = validateWrite(response.json, item, interests);
      markUnrelatedShortSummary(checked);
      return { validation: checked, backend: response.backend || writer.name };
    }
    const overrideNotNews = !isCommunityItem(item)
      && String(item.article_content || '').trim().length < 500;
    const protectedGaming = isProtectedGamingNews(item);
    const headlineOnly = isHeadlineOnly(item);
    const photoSubstance = isPhotoSubstance(item);

    try {
      const textPrompt = writeUserPrompt(item, { articleChars: settings.getWriterArticleChars() });
      const userPrompt = photoSubstance
        ? photoUserPrompt(item, { articleChars: settings.getWriterArticleChars() })
        : textPrompt;
      let first;
      if (photoSubstance) {
        try {
          first = await request(userPrompt, { vision: true });
          imageDescribed = true;
        } catch (error) {
          const fallbackReason = preWriteDropReason(item, { ignorePhoto: true });
          if (fallbackReason) {
            dropWithoutWriting(`photo unavailable; ${fallbackReason}`);
            return;
          }
          first = await request(textPrompt);
        }
      } else {
        first = await request(userPrompt);
      }
      validation = first.validation;
      writtenBy = first.backend;
      if (isPageDescription(validation.value)) {
        try {
          const retry = await request(`${textPrompt}\n\nWrite the news itself. Do not describe the page, article, subscription, membership, promotion or lack of content.`);
          validation = retry.validation;
          writtenBy = retry.backend;
        } catch (error) {
          validation.problems.push(`page-description retry failed: ${error.message}`);
        }
        if (isPageDescription(validation.value)) {
          validation.value.is_news = false;
          validation.problems = ['page-description retry still described the page'];
        }
      }
      if (validation.ok && (validation.value.is_news || overrideNotNews || protectedGaming)
        && (validation.missingTextFields || []).length > 0) {
        if (!headlineOnly) {
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
        }
        if (missingTextFields(validation.value).length > 0) {
          if (protectedGaming) {
            validation.value.summary = gamingTitleFallback(item.title);
            validation.value.is_news = true;
            validation.problems = ['Summary replaced from the title after persistent meta writing'];
          } else {
            validation.value.is_news = false;
            validation.problems = ['page-description retry still described unavailable source content'];
          }
        } else {
          // The same retry path also handles an unrelated very-short summary;
          // unlike page-description prose, that can safely fall back to a real
          // publisher teaser.
          applyMissingTextFallback(validation, item);
        }
      }
      const canRetryWriting = !headlineOnly && validation.ok && (validation.value.is_news || overrideNotNews)
        && !validation.problems.some(problem => problem.startsWith('page-description retry'));
      const retryReason = canRetryWriting
        ? headlineRetryReason(validation.value.headline, item)
        : null;
      const writingReasons = canRetryWriting
        ? writingRetryReasons(validation.value)
        : [];
      if (retryReason || writingReasons.length > 0) {
        stats.headline_retries++;
        const note = retryReason && writingReasons.length === 0
          ? `Headline "${validation.value.headline}" is ${retryReason}; write a specific headline of 6–14 words saying what happened, from the supplied text only.`
          : `Rewrite the headline or first summary sentence to name the subject and stand alone. Problems: ${[...new Set(writingReasons)].join('; ')}.`;
        try {
          const retry = await request(`${userPrompt}\n\n${note}`);
          if (!retry.validation.ok) {
            validation.problems.push('Headline retry was invalid');
          } else if (headlineRetryReason(retry.validation.value.headline, item) || writingRetryReasons(retry.validation.value).length > 0) {
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
      validation.value.summary = stripCommentOnlySentences(validation.value.summary);
      if (protectedGaming && !validation.value.summary) {
        validation.value.summary = gamingTitleFallback(item.title);
        validation.problems.push('Summary replaced from the title after comment-only writing');
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
      if (isNonNewsEssay(item) && validation.value.is_news) {
        validation.value.is_news = false;
        validation.problems.push('not news: programming tutorial or personal essay');
      }
      if (isSportStory(item, validation.value)) {
        validation.value.section = 'sport';
        const sportReason = sportDropReason(item, validation.value);
        if (sportReason && validation.value.is_news) {
          validation.value.is_news = false;
          validation.problems.push(`not news: ${sportReason}`);
        }
      }
      if (validation.value.is_news && !protectedGaming && isLowTextHeadlineEcho(item, validation.value)) {
        validation.value.is_news = false;
        validation.problems.push('not news: nothing beyond the headline');
      }
      if (!validation.value.is_news && protectedGaming
        && !validation.problems.some(problem => problem.startsWith('page-description retry'))) {
        validation.value.is_news = true;
        validation.problems.push('kept: interest-list gaming news');
        stats.not_news_overridden++;
      }
      if (!validation.value.is_news && overrideNotNews && !headlineOnly
        && !validation.problems.some(problem => problem === 'not news: nothing beyond the headline'
          || problem.startsWith('not news: programming tutorial')
          || problem.startsWith('not news: sport below')
          || problem.startsWith('page-description retry'))) {
        validation.value.is_news = true;
        validation.problems.push('kept: no article text, not-news ignored');
        stats.not_news_overridden++;
      }
      if (headlineOnly) {
        // Anything written beyond the headline would be made up, and a bare
        // title behind a paywall is no use to the reader (Jesse, 2026-10-15),
        // so the story is left out. A cluster with another outlet's teaser or
        // text is not headline-only and stays.
        validation.value.summary = '';
        validation.value.is_news = false;
        if (!validation.problems.includes('not news: nothing beyond the headline')) {
          validation.problems.push('not news: only the headline is available');
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
      ...(imageDescribed && validation.value.is_news ? { image_described: true } : {}),
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
  const deduplicated = dropWrittenDuplicates(storiesByIndex.filter(Boolean), log);
  const stories = deduplicated.stories;
  const dropped = [...droppedByIndex.filter(Boolean), ...deduplicated.dropped]
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  stats.written = stories.length;

  if (log && log.info) {
    log.info('pipeline:writer',
      `Wrote ${stories.length} stories: ${stats.repairs} ${plural(stats.repairs, 'repair')}, ${stats.headline_retries} ${plural(stats.headline_retries, 'headline retry', 'headline retries')}, ${stats.fallbacks} ${plural(stats.fallbacks, 'fallback')}, ${stats.not_news} not news, ${stats.not_news_overridden} ${plural(stats.not_news_overridden, 'not-news override')}, ${stats.section_moves} ${plural(stats.section_moves, 'section move')}, ${stats.facts_removed} ${plural(stats.facts_removed, 'fact', 'facts')} removed, ${stats.numbers_unsupported} unsupported ${plural(stats.numbers_unsupported, 'number')}`);
  }
  return { stories, dropped, stats };
}

module.exports = {
  writeStories,
  headlineSummaryOverlap,
  isUnrelatedShortSummary,
  isLowTextHeadlineEcho,
  writtenStorySimilarity,
  dropWrittenDuplicates,
  preWriteDropReason,
  isPhotoSubstance,
  isRedditPhotoPost,
  isMultiStoryRoundup,
};
