'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { fetchReddit } = require('../src/pipeline/sources/reddit');
const { redditRequestQueue, USER_AGENT } = require('../src/reddit-request-queue');

const log = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const originalFetch = globalThis.fetch;
const originalDateNow = Date.now;

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function atomResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get(name) {
        const values = {
          'content-type': 'application/atom+xml; charset=UTF-8',
          'x-ratelimit-used': '1',
          'x-ratelimit-remaining': '5.0',
          'x-ratelimit-reset': '60',
        };
        return values[name.toLowerCase()] || null;
      },
    },
    text: async () => body,
  };
}

describe('Reddit source', () => {
  beforeEach(() => {
    redditRequestQueue.reset();
    Date.now = () => Date.parse('2026-10-13T01:00:00.000Z');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Date.now = originalDateNow;
  });

  it('fetches and normalises the subreddit Atom feed', async () => {
    let requestedUrl;
    let requestedOptions;
    globalThis.fetch = async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return atomResponse(fixture('reddit-subreddit.atom.xml'));
    };

    const result = await fetchReddit({
      name: 'Tasmania Reddit',
      url: 'r/tasmania',
      config: { sort: 'new', limit: 7 },
      default_category: 'local',
    }, log);

    assert.strictEqual(requestedUrl, 'https://www.reddit.com/r/tasmania/new/.rss?limit=7');
    assert.strictEqual(requestedOptions.headers['User-Agent'], USER_AGENT);
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.items.length, 23);
    assert.deepStrictEqual(result.items[0], {
      title: 'Looking Down On Badger Beach, Northern Tassie',
      url: 'https://www.reddit.com/r/tasmania/comments/1x4hanh/looking_down_on_badger_beach_northern_tassie/',
      external_url: null,
      description: '',
      image: 'https://preview.redd.it/4iwl3n19d4vh1.jpeg?width=640&crop=smart&auto=webp&s=ceeb60b14ff0ad4ed126222b8275dcaf4493c959',
      published: '2026-10-12T23:30:37.000Z',
      score: null,
      comment_count: null,
      source_name: 'r/tasmania',
      source_type: 'reddit',
      default_category: 'local',
    });
    assert.strictEqual(result.items[1].description, '​ The Mercury is reporting that Glenorchy alderman and current mayoral/councillor candidate Peter Ridler was reprimanded, ordered to undertake training and suspended from office for one month following a Code of Conduct investigation. According to the reported findings, upheld conduct included: • using the N-word in the expression involving a “woodpile” during a council workshop; • telling a female council employee words to the effect of “stick to your knitting and get back to the kitchen”; • pu');
    assert.deepStrictEqual(result.items[13], {
      title: "Tasmania's EPA worried AI company Firmus plans to use generators much more than first disclosed",
      url: 'https://www.reddit.com/r/tasmania/comments/1x21m9e/tasmanias_epa_worried_ai_company_firmus_plans_to/',
      external_url: 'https://www.abc.net.au/news/2026-10-10/firmus-generators-epa-appeal-watchdog/107247476',
      description: '',
      image: 'https://external-preview.redd.it/_z1kP6d6KMKzHUJwfqo_XSuIXJpUMJMZha7EHQelF0s.jpeg?width=640&crop=smart&auto=webp&s=d9f6c112f055b36a5aafe26082869503a595bcd8',
      published: '2026-10-10T00:34:37.000Z',
      score: null,
      comment_count: null,
      source_name: 'r/tasmania',
      source_type: 'reddit',
      default_category: 'local',
    });
  });

  it('uses defaults and preserves a self-post body without the trailer', async () => {
    let requestedUrl;
    globalThis.fetch = async (url) => {
      requestedUrl = url;
      return atomResponse(fixture('reddit-homelab.atom.xml'));
    };

    const result = await fetchReddit({
      name: 'Homelab Reddit',
      url: '/r/homelab',
      default_category: 'technology',
    }, log);

    assert.strictEqual(requestedUrl, 'https://www.reddit.com/r/homelab/hot/.rss?limit=25');
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.items.length, 24);
    assert.deepStrictEqual(result.items[20], {
      title: 'Unmanaged switch recommendation with at least one 10Gbps SFP+ port and one 10Gbps RJ45 port',
      url: 'https://www.reddit.com/r/homelab/comments/1x4fb5s/unmanaged_switch_recommendation_with_at_least_one/',
      external_url: null,
      description: 'I just need direct connection from PC to Nas supporting 10Gbps connection to NAS. The other RJ45 ports are 3-4 low bandwidth IoT devices. Something not too wide less than 13”. Budget $400',
      image: null,
      published: '2026-10-12T22:01:17.000Z',
      score: null,
      comment_count: null,
      source_name: 'r/homelab',
      source_type: 'reddit',
      default_category: 'technology',
    });
  });
});
