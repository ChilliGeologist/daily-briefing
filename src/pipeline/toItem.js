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

  return {
    ...lead,
    title: lead.title,
    description: lead.description,
    sources: items.map(item => ({ name: item.source_name, url: item.url })),
    merged_descriptions: descriptions,
    image: leadFirst.map(item => item.image).find(image => image != null) ?? null,
    published: newestPublished(items, lead.published),
    relevance_score: rankedCluster.rank_score,
    article_content: rankedCluster.article_text,
    article_html: rankedCluster.article_html,
    article_url: rankedCluster.article_url,
    canonical_url: lead.canonical_url,
    top_comments: rankedCluster.top_comments,
  };
}

module.exports = { toItem };
