'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { canonicalUrl, stripPublisherSuffix, outletOf, normalise } = require('../src/pipeline/normalise');

describe('canonicalUrl', () => {
  it('drops tracking params, hash and trailing slash, lowercases host', () => {
    assert.strictEqual(
      canonicalUrl('https://WWW.SMH.com.au/national/story-20261012-p614xe.html?ref=rss&utm_medium=rss&utm_source=rss_feed#comments'),
      'https://www.smh.com.au/national/story-20261012-p614xe.html');
  });

  it('keeps non-tracking query params', () => {
    assert.strictEqual(canonicalUrl('https://example.com/a/?id=7&utm_source=x'), 'https://example.com/a?id=7');
  });

  it('returns null for junk', () => {
    assert.strictEqual(canonicalUrl('not a url'), null);
    assert.strictEqual(canonicalUrl(''), null);
  });
});

describe('stripPublisherSuffix', () => {
  it('splits the last " - Publisher" segment', () => {
    assert.deepStrictEqual(stripPublisherSuffix('‘Tragic’: Breaking Bad star dead at 34 - News.com.au'),
      { title: '‘Tragic’: Breaking Bad star dead at 34', publisher: 'News.com.au' });
  });

  it('leaves titles without a suffix alone', () => {
    assert.deepStrictEqual(stripPublisherSuffix('Bed bugs ground Qantas Rome-to-Perth flight'),
      { title: 'Bed bugs ground Qantas Rome-to-Perth flight', publisher: null });
  });

  it('ignores a suffix longer than 40 characters (it is part of the headline)', () => {
    const t = 'Minister responds - and the response is longer than forty characters in total';
    assert.deepStrictEqual(stripPublisherSuffix(t), { title: t, publisher: null });
  });
});

describe('normalise', () => {
  it('uses the external link as canonical for reddit link posts, permalink otherwise', () => {
    const out = normalise([
      { title: 'A', url: 'https://www.reddit.com/r/x/comments/1/a/', external_url: 'https://site.com/p?utm_source=r', source_type: 'reddit', source_name: 'r/x' },
      { title: 'B', url: 'https://www.reddit.com/r/x/comments/2/b/', external_url: null, source_type: 'reddit', source_name: 'r/x' },
    ]);
    assert.deepStrictEqual(out.map(i => [i.canonical_url, i.outlet]), [
      ['https://site.com/p', 'site.com'],
      ['https://www.reddit.com/r/x/comments/2/b', 'reddit.com'],
    ]);
  });

  it('strips the Google News suffix and uses the publisher as outlet', () => {
    const [i] = normalise([{ title: 'Star arrested over second mid-air incident - News.com.au',
      url: 'https://news.google.com/rss/articles/CBMiabc?oc=5', source_type: 'rss', source_name: 'news.com.au' }]);
    assert.deepStrictEqual([i.title, i.outlet], ['Star arrested over second mid-air incident', 'news.com.au']);
  });
});
