'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { isGoogleNewsUrl, resolveGoogleNewsUrl } = require('../src/pipeline/gnews');

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => body };
}

describe('Google News resolver', () => {
  it('recognises only Google News hosts', () => {
    assert.deepStrictEqual([
      isGoogleNewsUrl('https://news.google.com/rss/articles/CBMiabc?oc=5'),
      isGoogleNewsUrl('https://NEWS.GOOGLE.COM/articles/x'),
      isGoogleNewsUrl('https://example.com/news.google.com/x'),
      isGoogleNewsUrl('not a url'),
    ], [true, true, false, false]);
  });

  it('resolves a Google News article through batchexecute', async () => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        return response('<main data-n-a-sg="SIG" data-n-a-ts="123"></main>');
      }
      return response(`)]}'\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.news.com.au/x/news-story/abc\\",1]",null,null,null,"generic"]]`);
    };

    const resolved = await resolveGoogleNewsUrl(
      'https://news.google.com/rss/articles/CBMiabc?oc=5',
      { fetchImpl }
    );

    const inner = '["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"CBMiabc",123,"SIG"]';
    const expected = JSON.stringify([[['Fbv4je', inner, null, 'generic']]]);
    assert.strictEqual(resolved, 'https://www.news.com.au/x/news-story/abc');
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[1].url, 'https://news.google.com/_/DotsSplashUi/data/batchexecute');
    assert.strictEqual(new URLSearchParams(calls[1].options.body).get('f.req'), expected);
  });

  it('returns null without posting when the attributes are missing', async () => {
    const calls = [];
    const resolved = await resolveGoogleNewsUrl(
      'https://news.google.com/rss/articles/CBMiabc',
      { fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return response('<html></html>');
      } }
    );

    assert.strictEqual(resolved, null);
    assert.strictEqual(calls.length, 1);
  });
});
