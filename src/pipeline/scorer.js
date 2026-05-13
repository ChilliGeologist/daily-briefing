'use strict';

function recencyScore(item) {
  if (!item.published) return 20;
  const ageHours = (Date.now() - new Date(item.published).getTime()) / 3600000;
  if (ageHours <= 6) return 40;
  if (ageHours >= 48) return 5;
  return 40 - (35 * (ageHours - 6) / 42);
}

function engagementScore(item) {
  if (item.source_type === 'reddit' && item.score != null) {
    return Math.min(30, Math.log10(Math.max(item.score, 1)) * 10);
  }
  if (item.source_type === 'api' && item.score != null) {
    return Math.min(30, Math.log10(Math.max(item.score, 1)) * 12);
  }
  return 15;
}

function keywordBonus(item, preferences) {
  const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
  let bonus = 0;
  for (const kw of (preferences.boost_keywords || [])) {
    if (text.includes(kw.toLowerCase())) bonus += 10;
  }
  for (const kw of (preferences.penalty_keywords || [])) {
    if (text.includes(kw.toLowerCase())) bonus -= 10;
  }
  return bonus;
}

function scoreAndFilter(items, settings, log, emitProgress) {
  const preferences = settings.getPreferences();
  const threshold = settings.getScoreThreshold();
  const maxItems = settings.getMaxCuratedItems();

  if (emitProgress) emitProgress('score', 0, items.length);
  const scored = items.map((item, idx) => {
    const recency = recencyScore(item);
    const engagement = engagementScore(item);
    const keywords = keywordBonus(item, preferences);
    const raw = recency + engagement + keywords;
    const relevance_score = Math.max(0, raw);

    log.debug('scorer', `Score: ${relevance_score} (recency=${recency.toFixed(1)}, engagement=${engagement.toFixed(1)}, keywords=${keywords}) - ${item.title}`);

    if (emitProgress) emitProgress('score', idx + 1, items.length);
    return { ...item, relevance_score };
  });

  scored.sort((a, b) => b.relevance_score - a.relevance_score);

  const passed = [];
  const dropped = [];

  for (const item of scored) {
    if (item.relevance_score >= threshold) {
      passed.push(item);
    } else {
      dropped.push(item);
    }
  }

  // Diversity-aware cap: reserve slots for underrepresented source types
  if (maxItems > 0 && passed.length > maxItems) {
    const rssReserve = Math.round(maxItems * 0.3); // 30% for RSS
    const selected = [];
    const rssItems = passed.filter(i => i.source_type === 'rss');
    const otherItems = passed.filter(i => i.source_type !== 'rss');

    // Take top RSS items up to reserve
    const rssSelected = rssItems.slice(0, rssReserve);
    // Fill remaining slots from all items by score, skipping already-selected RSS
    const rssSelectedSet = new Set(rssSelected.map(i => i.title));
    const remaining = passed.filter(i => !rssSelectedSet.has(i.title));
    const otherSelected = remaining.slice(0, maxItems - rssSelected.length);

    selected.push(...rssSelected, ...otherSelected);
    selected.sort((a, b) => b.relevance_score - a.relevance_score);

    const cappedCount = passed.length - selected.length;
    const droppedFromCap = passed.filter(i => !selected.includes(i));
    dropped.push(...droppedFromCap);

    log.info('scorer', `Scored ${items.length} items: ${passed.length} above threshold (${threshold}), diversity cap to ${maxItems} (${rssSelected.length} RSS reserved), ${dropped.length} dropped`);

    return {
      passed: selected,
      dropped,
      stats: {
        total: items.length,
        passed: selected.length,
        dropped: dropped.length,
        threshold,
        capped_count: cappedCount,
        max_items: maxItems,
        rss_reserved: rssSelected.length,
      },
    };
  }

  const stats = {
    total: items.length,
    passed: passed.length,
    dropped: dropped.length,
    threshold,
    capped_count: 0,
    max_items: maxItems,
  };

  let msg = `Scored ${stats.total} items: ${stats.passed} above threshold (${threshold}), ${stats.dropped} dropped`;
  log.info('scorer', msg);

  return { passed, dropped, stats };
}

module.exports = { scoreAndFilter, recencyScore, engagementScore, keywordBonus };
