'use strict';

const { matchInterests, interestScore } = require('./writer/interests');

// Three outlets add 25 * log2(3) = 39.6 coverage points over one outlet.
// A weight-3 local match adds 39 points, putting those signals roughly level.
const INTEREST_POINTS = 13;

function recencyScore(item, now = Date.now()) {
  if (!item.published) return 20;
  const ageHours = (now - new Date(item.published).getTime()) / 3600000;
  if (ageHours <= 6) return 40;
  if (ageHours >= 48) return 5;
  return 40 - (35 * (ageHours - 6) / 42);
}

function keywordBonus(item, preferences) {
  const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
  let bonus = 0;
  for (const keyword of (preferences.boost_keywords || [])) {
    if (text.includes(keyword.toLowerCase())) bonus += 10;
  }
  for (const keyword of (preferences.penalty_keywords || [])) {
    if (text.includes(keyword.toLowerCase())) bonus -= 10;
  }
  return bonus;
}

function newestItem(cluster) {
  let newest = null;
  let newestTime = -Infinity;

  for (const item of cluster.items) {
    if (!item.published) continue;
    const time = new Date(item.published).getTime();
    if (!Number.isNaN(time) && time > newestTime) {
      newest = item;
      newestTime = time;
    }
  }

  return newest || cluster.lead;
}

function positionScore(items) {
  return items.reduce((best, item) => {
    const position = item.list_position;
    let score = 0;
    if (position <= 3) score = 15;
    else if (position <= 10) score = 10;
    else if (position <= 25) score = 5;
    return Math.max(best, score);
  }, 0);
}

function scoreCluster(cluster, { now, boostKeywords, penaltyKeywords, interests }) {
  const coverageScore = 25 * Math.log2(Math.max(1, cluster.coverage));
  const recency = recencyScore(newestItem(cluster), now);
  const position = positionScore(cluster.items);
  const keywords = keywordBonus(cluster.lead, {
    boost_keywords: boostKeywords || [],
    penalty_keywords: penaltyKeywords || [],
  });
  const interestText = cluster.items
    .map(item => `${item.title || ''} ${item.description || ''}`)
    .join('\n');
  const interest_matches = matchInterests(interestText, interests || []);
  const interestPoints = interestScore(interest_matches) * INTEREST_POINTS;
  const priority = Math.max(...cluster.items.map(item => item.source_priority ?? 1));
  const rank_score = Math.max(0, (coverageScore + recency + position + keywords + interestPoints) * priority);
  return { ...cluster, interest_matches, rank_score };
}

function rankClusters(clusters, {
  now = Date.now(),
  boostKeywords = [],
  penaltyKeywords = [],
  interests = [],
  limit,
  perSourceFloor = 2,
  perCategoryFloor = 12,
} = {}) {
  const scored = clusters
    .map(cluster => scoreCluster(cluster, { now, boostKeywords, penaltyKeywords, interests }))
    .sort((a, b) => b.rank_score - a.rank_score);
  const selectionLimit = limit == null ? scored.length : Math.max(0, limit);
  const topIds = new Set(scored.slice(0, selectionLimit).map(cluster => cluster.id));
  const sources = [...new Set(scored.flatMap(cluster =>
    cluster.items.map(item => item.source_name).filter(Boolean)
  ))];
  const floorSelection = new Map();

  for (const source of sources) {
    const sourceClusters = scored
      .filter(cluster => cluster.items.some(item => item.source_name === source))
      .slice(0, perSourceFloor);
    for (const cluster of sourceClusters) floorSelection.set(cluster.id, cluster);
  }

  // Each source category (gaming, trending, homelab...) keeps its best stories
  // too. One global ranking let national news and Hacker News fill every
  // place: on 2026-10-15 the internet-culture feeds reached the writer only
  // at ranks 106-120 and Around the internet ended with two stories.
  const categories = [...new Set(scored.flatMap(cluster =>
    cluster.items.map(item => item.default_category).filter(Boolean)
  ))];
  for (const category of categories) {
    const categoryClusters = scored
      .filter(cluster => cluster.items.some(item => item.default_category === category))
      .slice(0, perCategoryFloor);
    for (const cluster of categoryClusters) floorSelection.set(cluster.id, cluster);
  }

  let selected = [...floorSelection.values()]
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, selectionLimit);
  const selectedIds = new Set(selected.map(cluster => cluster.id));

  for (const cluster of scored) {
    if (selected.length >= selectionLimit) break;
    if (!selectedIds.has(cluster.id)) {
      selected.push(cluster);
      selectedIds.add(cluster.id);
    }
  }

  selected.sort((a, b) => b.rank_score - a.rank_score);
  const floorAdded = selected.filter(cluster =>
    floorSelection.has(cluster.id) && !topIds.has(cluster.id)
  ).length;
  const rankedSelected = selected.map((cluster, index) => ({ ...cluster, rank: index + 1 }));
  const dropped = scored
    .filter(cluster => !selectedIds.has(cluster.id))
    .map((cluster, index) => ({ ...cluster, rank: rankedSelected.length + index + 1 }));

  return {
    selected: rankedSelected,
    dropped,
    stats: {
      clusters: clusters.length,
      selected: rankedSelected.length,
      floor_added: floorAdded,
    },
  };
}

module.exports = { rankClusters, recencyScore, keywordBonus, INTEREST_POINTS };
