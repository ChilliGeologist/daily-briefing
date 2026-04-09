'use strict';

function extractImage(data) {
  // Check preview images first
  if (data.preview && data.preview.images && data.preview.images[0] &&
      data.preview.images[0].source && data.preview.images[0].source.url) {
    return data.preview.images[0].source.url.replace(/&amp;/g, '&');
  }
  // Check thumbnail, skip special values
  const skipThumbs = ['self', 'default', 'nsfw', 'spoiler', ''];
  if (data.thumbnail && !skipThumbs.includes(data.thumbnail)) {
    return data.thumbnail;
  }
  return null;
}

async function fetchReddit(source, log) {
  const start = Date.now();

  try {
    // Normalise subreddit name
    let sub = source.url || '';
    sub = sub.replace(/^r\//, '').replace(/^\/r\//, '').trim();

    const sort = (source.config && source.config.sort) || 'hot';
    const limit = (source.config && source.config.limit) || 25;

    const url = `https://www.reddit.com/r/${sub}/${sort}.json?limit=${limit}&raw_json=1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'DailyBriefing/2.0' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const children = (json.data && json.data.children) || [];
    const items = [];

    for (const child of children) {
      const post = child.data;
      if (!post) continue;

      // Filter stickied posts and low-score posts
      if (post.stickied) continue;
      if (post.score < 1) continue;

      const normalised = {
        title: post.title || '',
        url: `https://www.reddit.com${post.permalink}`,
        external_url: post.is_self ? null : (post.url || null),
        description: (post.selftext || '').substring(0, 500),
        image: extractImage(post),
        published: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
        score: post.score != null ? post.score : null,
        comment_count: post.num_comments != null ? post.num_comments : null,
        source_name: `r/${sub}`,
        source_type: 'reddit',
        default_category: source.default_category,
      };

      log.debug('reddit', `Parsed post: ${normalised.title}`, { score: post.score });
      items.push(normalised);
    }

    const duration = Date.now() - start;
    log.info('reddit', `Fetched ${items.length} items from r/${sub}`, { duration_ms: duration });

    return { items, error: null };
  } catch (err) {
    const duration = Date.now() - start;
    log.error('reddit', `Failed to fetch Reddit source ${source.name}: ${err.message}`, { duration_ms: duration });
    return { items: [], error: err.message };
  }
}

module.exports = { fetchReddit, extractImage };
