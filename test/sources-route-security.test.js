'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sourceRoutes = require('../src/routes/sources');
const { subredditName } = require('../src/pipeline/sources/reddit');

async function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function routeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', sourceRoutes({
    getSources: () => [],
    getLatestSourceRunResults: () => ({}),
  }));
  return app;
}

test('source detect and preview reject non-HTTP URL schemes', async t => {
  const server = await listen(routeApp());
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  for (const [path, body] of [
    ['/api/sources/detect', { url: 'file:///etc/passwd' }],
    ['/api/sources/preview', { name: 'Local file', type: 'rss', url: 'file:///etc/passwd' }],
    ['/api/sources/preview', { name: 'Data', type: 'api', url: 'data:application/json,[]' }],
  ]) {
    const response = await fetch(origin + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.strictEqual(response.status, 400);
    assert.deepStrictEqual(await response.json(), { error: 'Only http: and https: URLs are allowed' });
  }
});

test('source preview ignores client configuration and still permits private HTTP feeds', async t => {
  const feed = express();
  feed.get('/items', (_req, res) => res.json([]));
  const feedServer = await listen(feed);
  t.after(() => new Promise(resolve => feedServer.close(resolve)));

  const api = await listen(routeApp());
  t.after(() => new Promise(resolve => api.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${api.address().port}/api/sources/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Local API',
      type: 'api',
      url: `http://127.0.0.1:${feedServer.address().port}/items`,
      config: {
        list_url: 'data:application/json,%5B%7B%22title%22%3A%22Injected%22%7D%5D',
        mapping: { title: 'title' },
      },
    }),
  });

  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), { count: 0, headlines: [] });
});

test('Reddit detection returns an HTTP URL that the Reddit fetcher understands', async t => {
  const server = await listen(routeApp());
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/sources/detect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.reddit.com/r/tasmania/' }),
  });

  assert.strictEqual(response.status, 200);
  const detected = await response.json();
  assert.deepStrictEqual(detected, {
    type: 'reddit',
    url: 'https://www.reddit.com/r/tasmania',
    name: 'r/tasmania',
  });
  assert.strictEqual(subredditName(detected), 'tasmania');
  assert.strictEqual(subredditName({ url: 'tasmania' }), 'tasmania');
});
