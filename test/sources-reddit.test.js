'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { extractImage } = require('../src/pipeline/sources/reddit');

// Minimal logger for tests
const log = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

describe('Reddit source', () => {
  describe('extractImage', () => {
    it('should extract from preview images', () => {
      const data = {
        preview: {
          images: [{
            source: { url: 'https://preview.redd.it/image.jpg?width=1080&amp;format=pjpg' },
          }],
        },
      };
      assert.strictEqual(extractImage(data), 'https://preview.redd.it/image.jpg?width=1080&format=pjpg');
    });

    it('should skip special thumbnail values', () => {
      for (const thumb of ['self', 'default', 'nsfw', 'spoiler', '']) {
        assert.strictEqual(extractImage({ thumbnail: thumb }), null);
      }
    });

    it('should use valid thumbnail as fallback', () => {
      const data = { thumbnail: 'https://b.thumbs.redditmedia.com/thumb.jpg' };
      assert.strictEqual(extractImage(data), 'https://b.thumbs.redditmedia.com/thumb.jpg');
    });

    it('should return null when no image available', () => {
      assert.strictEqual(extractImage({}), null);
    });
  });

  describe('Reddit response normalisation', () => {
    function normalisePost(post) {
      const data = post.data;
      return {
        title: data.title || '',
        url: `https://www.reddit.com${data.permalink}`,
        external_url: data.is_self ? null : (data.url || null),
        description: (data.selftext || '').substring(0, 500),
        image: extractImage(data),
        published: data.created_utc ? new Date(data.created_utc * 1000).toISOString() : null,
        score: data.score != null ? data.score : null,
        comment_count: data.num_comments != null ? data.num_comments : null,
        source_name: 'r/test',
        source_type: 'reddit',
        default_category: 'trending',
      };
    }

    it('should normalise a link post correctly', () => {
      const post = {
        data: {
          title: 'Interesting external link',
          permalink: '/r/test/comments/abc123/interesting/',
          is_self: false,
          url: 'https://external.com/article',
          selftext: '',
          created_utc: 1705312200,
          score: 150,
          num_comments: 42,
          stickied: false,
          thumbnail: 'https://thumb.redd.it/thumb.jpg',
        },
      };

      const result = normalisePost(post);
      assert.strictEqual(result.title, 'Interesting external link');
      assert.strictEqual(result.url, 'https://www.reddit.com/r/test/comments/abc123/interesting/');
      assert.strictEqual(result.external_url, 'https://external.com/article');
      assert.strictEqual(result.score, 150);
      assert.strictEqual(result.comment_count, 42);
      assert.strictEqual(result.source_type, 'reddit');
    });

    it('should normalise a self post correctly', () => {
      const post = {
        data: {
          title: 'Question about something',
          permalink: '/r/test/comments/def456/question/',
          is_self: true,
          url: 'https://www.reddit.com/r/test/comments/def456/question/',
          selftext: 'This is my question text',
          created_utc: 1705312200,
          score: 25,
          num_comments: 10,
          stickied: false,
          thumbnail: 'self',
        },
      };

      const result = normalisePost(post);
      assert.strictEqual(result.external_url, null);
      assert.strictEqual(result.description, 'This is my question text');
      assert.strictEqual(result.image, null); // thumbnail = 'self' should be skipped
    });

    it('should filter stickied posts', () => {
      const children = [
        { data: { title: 'Stickied', stickied: true, score: 100 } },
        { data: { title: 'Normal', stickied: false, score: 50 } },
        { data: { title: 'Low score', stickied: false, score: 0 } },
      ];

      const filtered = children.filter(c => !c.data.stickied && c.data.score >= 1);
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].data.title, 'Normal');
    });

    it('should filter posts with score < 1', () => {
      const children = [
        { data: { title: 'Good', stickied: false, score: 5 } },
        { data: { title: 'Bad', stickied: false, score: 0 } },
        { data: { title: 'Negative', stickied: false, score: -3 } },
      ];

      const filtered = children.filter(c => !c.data.stickied && c.data.score >= 1);
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].data.title, 'Good');
    });

    it('should handle missing preview images', () => {
      const data = { preview: { images: [] } };
      assert.strictEqual(extractImage(data), null);
    });
  });
});
