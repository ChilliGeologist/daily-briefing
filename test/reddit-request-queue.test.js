'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { RedditRequestQueue, USER_AGENT } = require('../src/reddit-request-queue');

function headers(values = {}) {
  const normalised = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name.toLowerCase(), String(value)])
  );
  return {
    get(name) {
      return normalised[name.toLowerCase()] ?? null;
    },
  };
}

function response(status, headerValues = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? 'Too Many Requests' : 'OK',
    headers: headers(headerValues),
  };
}

function fakeTime() {
  let current = 0;
  const sleeps = [];
  return {
    now: () => current,
    sleep: async ms => {
      sleeps.push(ms);
      current += ms;
    },
    advance: ms => {
      current += ms;
    },
    sleeps,
  };
}

describe('Reddit request queue', () => {
  it('serialises requests and waits for a depleted rate-limit window', async () => {
    const clock = fakeTime();
    const requestTimes = [];
    const responses = [
      response(200, { 'x-ratelimit-remaining': '0.0', 'x-ratelimit-reset': '10' }),
      response(200, { 'x-ratelimit-remaining': '4.0', 'x-ratelimit-reset': '49' }),
    ];
    const info = [];
    const queue = new RedditRequestQueue({
      now: clock.now,
      sleep: clock.sleep,
      fetchImpl: async () => {
        requestTimes.push(clock.now());
        return responses.shift();
      },
    });
    const log = { info: (...args) => info.push(args) };

    await Promise.all([
      queue.fetch('https://www.reddit.com/r/one/.rss', { log }),
      queue.fetch('https://www.reddit.com/r/two/.rss', { log }),
    ]);

    assert.deepStrictEqual(requestTimes, [0, 11000]);
    assert.deepStrictEqual(clock.sleeps, [11000]);
    assert.deepStrictEqual(info.map(entry => entry[2]), [
      { url: 'https://www.reddit.com/r/one/.rss', wait_ms: 0 },
      { url: 'https://www.reddit.com/r/two/.rss', wait_ms: 11000 },
    ]);
  });

  it('waits two seconds between requests when rate-limit headers are absent', async () => {
    const clock = fakeTime();
    const requestTimes = [];
    let callCount = 0;
    const queue = new RedditRequestQueue({
      now: clock.now,
      sleep: clock.sleep,
      fetchImpl: async () => {
        requestTimes.push(clock.now());
        if (callCount++ === 0) clock.advance(500);
        return response(200);
      },
    });

    await queue.fetch('https://www.reddit.com/r/one/.rss');
    await queue.fetch('https://www.reddit.com/r/two/.rss');

    assert.deepStrictEqual(requestTimes, [0, 2500]);
    assert.deepStrictEqual(clock.sleeps, [2000]);
  });

  it('retries HTTP 429 twice using reset and Retry-After delays', async () => {
    const clock = fakeTime();
    const requestTimes = [];
    const requestOptions = [];
    const responses = [
      response(429, { 'x-ratelimit-remaining': '0.0', 'x-ratelimit-reset': '2' }),
      response(429, { 'retry-after': '3' }),
      response(200, { 'x-ratelimit-remaining': '1.0', 'x-ratelimit-reset': '50' }),
    ];
    const queue = new RedditRequestQueue({
      now: clock.now,
      sleep: clock.sleep,
      fetchImpl: async (_url, options) => {
        requestTimes.push(clock.now());
        requestOptions.push(options);
        return responses.shift();
      },
    });

    const result = await queue.fetch('https://www.reddit.com/r/test/.rss');

    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(requestTimes, [0, 3000, 7000]);
    assert.deepStrictEqual(clock.sleeps, [3000, 4000]);
    assert.deepStrictEqual(requestOptions.map(options => options.headers['User-Agent']), [
      USER_AGENT,
      USER_AGENT,
      USER_AGENT,
    ]);
  });
});
