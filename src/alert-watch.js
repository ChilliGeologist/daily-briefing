'use strict';

const { collect } = require('./pipeline/collector');
const { normalise } = require('./pipeline/normalise');
const { filterItems } = require('./pipeline/filter');
const { extractArticle } = require('./pipeline/extractor');
const { clusterItems } = require('./pipeline/cluster');
const { makeJudge } = require('./pipeline/sameStory');
const {
  alertDecision,
  buildAlertPayload,
  localDateAndHour,
  parseAlertVerdict,
  selectAlertCandidates,
  watchIdentity,
} = require('./notifications');

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const THIN_TEASER_CHARS = 180;

let watchRunning = false;

function alertPrompt(candidate) {
  const item = candidate.item;
  const readerContext = candidate.kind === 'emergency'
    ? 'The reader lives near West Tamar and Launceston in northern Tasmania.'
    : candidate.kind === 'security'
      ? 'The reader runs the named product or service at home.'
      : 'The reader marked this interest as important enough to interrupt him.';
  const sourceText = String(item.article_content || item.description || '').slice(0, 5000);
  return `Decide whether this reader should be interrupted by an urgent notification now.

Answer with JSON only: {"urgent":true|false,"reason":"one short sentence"}.
Say yes only when acting or knowing within hours matters to this reader. A routine release, general security news, distant emergency, opinion or useful item that can wait until morning is not urgent.

${readerContext}
Headline: ${item.title || ''}
Source: ${item.source_name || ''}
Candidate type: ${candidate.kind}
Text: ${sourceText}`;
}

function alertItem(row) {
  return {
    title: row.headline,
    description: row.summary,
    canonical_url: row.canonical_url,
    url: row.original_url,
    outlet: row.source_name,
    source_name: row.source_name,
  };
}

async function isDuplicate(candidate, sentAlerts, ollama, settings, log) {
  const judgeSettings = {
    getOllamaUrl: () => settings.getOllamaUrl(),
    getOllamaModel: () => settings.getWriterOllamaModel(),
  };
  for (const earlier of sentAlerts) {
    const pair = [candidate.item, alertItem(earlier)];
    const result = await clusterItems(pair, {
      judge: makeJudge(ollama, judgeSettings, log),
      maxChecks: 1,
      log,
    });
    if (result.clusters.length === 1) return earlier;
  }
  return null;
}

function storedAlert(candidate, checkId, localDate, now, overrides = {}) {
  const item = candidate.item;
  const identity = watchIdentity(item);
  const originalUrl = item.article_url || item.canonical_url || item.url || null;
  const articleSummary = String(item.article_content || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  return {
    check_id: checkId,
    local_date: localDate,
    headline: item.title || 'Urgent update',
    kicker: candidate.kicker,
    reason: overrides.reason || null,
    summary: String(item.description || '').trim() || articleSummary || null,
    original_url: originalUrl,
    canonical_url: identity.canonical_url || null,
    title_hash: identity.title_hash,
    source_name: item.source_name || null,
    source_kind: item.source_kind || null,
    candidate_kind: candidate.kind,
    model_verdict: overrides.model_verdict || 'not_asked',
    sent: Boolean(overrides.sent),
    not_sent_reason: overrides.not_sent_reason || null,
    created_at: now.toISOString(),
    sent_at: overrides.sent_at || null,
  };
}

async function enrichThinTeaser(candidate, log, fetchImpl) {
  const item = candidate.item;
  if (String(item.description || '').trim().length >= THIN_TEASER_CHARS) return;
  const url = item.canonical_url || item.url;
  if (!url) return;
  try {
    const article = await extractArticle(url, log, fetchImpl);
    item.article_content = article.article_content;
    item.article_url = article.canonical_url;
  } catch (error) {
    log.warn('alert-watch', `Article fetch failed for "${item.title}": ${error.message}`);
  }
}

async function runAlertWatch(db, ollama, settings, log, options = {}) {
  const now = options.now || new Date();
  const timezone = settings.getTimezone();
  const local = localDateAndHour(now, timezone);
  const checkId = db.createAlertCheck({ local_date: local.date, started_at: now.toISOString() });

  if (watchRunning || (options.isPipelineRunning && options.isPipelineRunning())) {
    const reason = watchRunning ? 'alert watch already running' : 'main pipeline running';
    db.finishAlertCheck(checkId, {
      finished_at: now.toISOString(), status: 'skipped', sources_read: [],
      items_seen: 0, candidates_count: 0, error: reason,
    });
    log.info('alert-watch', `Skipped urgent check: ${reason}`);
    return { checkId, status: 'skipped', reason, candidates: [] };
  }

  watchRunning = true;
  let sourceNames = [];
  let itemCount = 0;
  let candidateCount = 0;
  try {
    const sources = db.getEnabledSources().filter(source => source.type !== 'reddit');
    sourceNames = sources.map(source => source.name);
    const collected = await collect(db, log, null, { sources });
    const filtered = filterItems(normalise(collected.items), {
      maxAgeHours: 6,
      fillerPatterns: settings.getFillerPatterns(),
      sourceMaxAge: new Map(),
      now: now.getTime(),
    }).kept.filter(item => {
      const published = Date.parse(item.published);
      return !Number.isNaN(published) && now.getTime() - published <= SIX_HOURS_MS;
    });
    itemCount = filtered.length;

    db.pruneWatchSeen(new Date(now.getTime() - THREE_DAYS_MS).toISOString());
    const unseen = filtered.filter(item => {
      const identity = watchIdentity(item);
      return !db.hasWatchSeen(identity.canonical_url, identity.title_hash);
    });
    for (const item of unseen) {
      const identity = watchIdentity(item);
      db.markWatchSeen(identity.canonical_url, identity.title_hash, now.toISOString());
    }

    const candidates = selectAlertCandidates(unseen, settings.getInterests());
    candidateCount = candidates.length;
    const sentAlerts = db.getSentAlerts(local.date);
    let sentCount = sentAlerts.length;

    for (const candidate of candidates) {
      const policy = alertDecision({ hour: local.hour, time: local.time, sentCount, kind: candidate.kind }, settings);
      if (!policy.allowed) {
        db.addAlert(storedAlert(candidate, checkId, local.date, now, {
          not_sent_reason: policy.reason,
        }));
        continue;
      }

      let duplicate = null;
      try {
        duplicate = await isDuplicate(candidate, sentAlerts, ollama, settings, log);
      } catch (error) {
        log.warn('alert-watch', `Same-story check failed for "${candidate.item.title}": ${error.message}`);
      }
      if (duplicate) {
        db.addAlert(storedAlert(candidate, checkId, local.date, now, {
          not_sent_reason: `same story as alert ${duplicate.id}`,
        }));
        continue;
      }

      await enrichThinTeaser(candidate, log, options.fetchImpl || globalThis.fetch);
      let verdict;
      try {
        const result = await ollama.generate(
          settings.getOllamaUrl(),
          settings.getWriterOllamaModel(),
          alertPrompt(candidate),
          { temperature: 0, num_predict: 100, format: 'json' }
        );
        verdict = parseAlertVerdict(result.response);
        if (!verdict) throw new Error('invalid JSON verdict');
      } catch (error) {
        db.addAlert(storedAlert(candidate, checkId, local.date, now, {
          model_verdict: 'error',
          reason: error.message,
          not_sent_reason: 'model failure',
        }));
        log.warn('alert-watch', `Urgency model failed for "${candidate.item.title}": ${error.message}`);
        continue;
      }

      if (!verdict.urgent) {
        db.addAlert(storedAlert(candidate, checkId, local.date, now, {
          model_verdict: 'no', reason: verdict.reason, not_sent_reason: 'model said no',
        }));
        continue;
      }

      const alertId = db.addAlert(storedAlert(candidate, checkId, local.date, now, {
        model_verdict: 'yes', reason: verdict.reason,
      }));
      const alert = db.getAlertById(alertId);
      let results = [];
      try {
        results = options.sendNotification ? await options.sendNotification(buildAlertPayload(alert)) : [];
      } catch (error) {
        log.warn('alert-watch', `Push failed for alert ${alertId}: ${error.message}`);
      }
      const delivered = results.some(result => result.ok);
      const sentAt = delivered ? new Date().toISOString() : null;
      db.updateAlert(alertId, {
        sent: delivered,
        sent_at: sentAt,
        not_sent_reason: delivered ? null : (results.length === 0 ? 'no subscriptions' : 'push failed'),
      });
      if (delivered) {
        const stored = db.getAlertById(alertId);
        sentAlerts.push(stored);
        sentCount++;
        log.info('alert-watch', `Sent ${candidate.kicker.toLowerCase()} alert: ${candidate.item.title}`);
      }
    }

    db.finishAlertCheck(checkId, {
      finished_at: new Date().toISOString(), status: 'completed', sources_read: sourceNames,
      items_seen: itemCount, candidates_count: candidateCount, error: null,
    });
    log.info('alert-watch', `Urgent check complete: ${sourceNames.length} sources, ${itemCount} recent items, ${candidateCount} candidates`);
    return { checkId, status: 'completed', sources: sourceNames, items: itemCount, candidates };
  } catch (error) {
    db.finishAlertCheck(checkId, {
      finished_at: new Date().toISOString(), status: 'error', sources_read: sourceNames,
      items_seen: itemCount, candidates_count: candidateCount, error: error.message,
    });
    log.error('alert-watch', `Urgent check failed: ${error.message}`);
    return { checkId, status: 'error', error: error.message, candidates: [] };
  } finally {
    watchRunning = false;
  }
}

module.exports = { runAlertWatch, alertPrompt, isDuplicate };
