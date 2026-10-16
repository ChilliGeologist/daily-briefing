'use strict';

function newestPublished(items, fallback) {
  let newest = null;
  let newestTime = -Infinity;
  for (const item of items) {
    if (!item.published) continue;
    const time = Date.parse(item.published);
    if (!Number.isNaN(time) && time > newestTime) {
      newest = item.published;
      newestTime = time;
    }
  }
  return newest || fallback;
}

function toItem(rankedCluster) {
  const { lead, items } = rankedCluster;
  const leadFirst = [lead, ...items.filter(item => item !== lead)];
  const descriptions = [];
  const seenDescriptions = new Set();

  for (const item of leadFirst) {
    if (!item.description || seenDescriptions.has(item.description)) continue;
    seenDescriptions.add(item.description);
    descriptions.push(item.description);
  }

  const image = leadFirst.map(item => item.image).find(value => typeof value === 'string' && value) ?? null;
  const hasPhotoImages = leadFirst.some(item => Array.isArray(item.images) && item.images.length > 0);
  const images = [];
  if (hasPhotoImages) {
    for (const value of [image, ...leadFirst.flatMap(item => item.images || [])]) {
      if (typeof value === 'string' && value && !images.includes(value)) images.push(value);
      if (images.length === 4) break;
    }
  }

  return {
    ...lead,
    title: lead.title,
    description: lead.description,
    sources: items.map(item => ({ name: item.source_name, url: item.url })),
    outlet_versions: items.map(item => ({
      name: item.source_name,
      headline: item.title,
      description: item.description || '',
      url: item.url,
      text: item.article_content || item.description || '',
    })),
    merged_descriptions: descriptions,
    image,
    ...(images.length > 0 ? { images } : {}),
    published: newestPublished(items, lead.published),
    relevance_score: rankedCluster.rank_score,
    article_content: rankedCluster.article_text,
    article_html: rankedCluster.article_html,
    article_url: rankedCluster.article_url,
    canonical_url: lead.canonical_url,
    top_comments: rankedCluster.top_comments,
    ...(rankedCluster.real_reply_count != null ? { real_reply_count: rankedCluster.real_reply_count } : {}),
    interest_matches: rankedCluster.interest_matches || [],
    coverage: rankedCluster.coverage,
    rank: rankedCluster.rank,
  };
}

module.exports = { toItem };
