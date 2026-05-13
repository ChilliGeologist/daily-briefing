'use strict';

const { fetchRSS } = require('./sources/rss');
const { fetchReddit } = require('./sources/reddit');
const { fetchAPI } = require('./sources/api');

const FETCHERS = {
  rss: fetchRSS,
  reddit: fetchReddit,
  api: fetchAPI,
};

async function collect(db, log, emitProgress) {
  const start = Date.now();
  const sources = db.getEnabledSources();

  log.info('collector', `Starting collection from ${sources.length} enabled sources`);

  const stats = {
    sources_attempted: sources.length,
    sources_succeeded: 0,
    sources_failed: 0,
    failures: [],
    items_by_source: {},
    duration_ms: 0,
  };

  if (sources.length === 0) {
    stats.duration_ms = Date.now() - start;
    log.warn('collector', 'No enabled sources found');
    return { items: [], stats };
  }

  // Launch all fetchers in parallel, emit progress as each completes
  let completed = 0;
  const total = sources.length;
  if (emitProgress) emitProgress('collect', 0, total);

  const promises = sources.map(source => {
    const fetcher = FETCHERS[source.type];
    if (!fetcher) {
      return Promise.resolve({
        source,
        result: { items: [], error: `Unknown source type: ${source.type}` },
      }).then(r => { completed++; if (emitProgress) emitProgress('collect', completed, total); return r; });
    }
    return fetcher(source, log).then(
      result => { completed++; if (emitProgress) emitProgress('collect', completed, total); return { source, result }; },
      err => { completed++; if (emitProgress) emitProgress('collect', completed, total); return { source, result: { items: [], error: err.message } }; }
    );
  });

  const results = await Promise.allSettled(promises);

  const allItems = [];

  for (const settled of results) {
    // All promises are wrapped to resolve, but handle just in case
    const { source, result } = settled.status === 'fulfilled' ? settled.value : { source: null, result: { items: [], error: 'Unexpected rejection' } };

    if (!source) continue;

    if (result.error) {
      stats.sources_failed++;
      stats.failures.push({ source_name: source.name, error: result.error });
      log.warn('collector', `Source failed: ${source.name} - ${result.error}`);
      db.updateSourceFetchStatus(source.id, 'error', result.error);
    } else {
      stats.sources_succeeded++;
      db.updateSourceFetchStatus(source.id, 'ok', null);
    }

    stats.items_by_source[source.name] = result.items.length;
    allItems.push(...result.items);
  }

  stats.duration_ms = Date.now() - start;

  log.info('collector', `Collection complete: ${allItems.length} items from ${stats.sources_succeeded}/${stats.sources_attempted} sources`, {
    duration_ms: stats.duration_ms,
    failed: stats.sources_failed,
  });

  return { items: allItems, stats };
}

module.exports = { collect };
