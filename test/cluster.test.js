'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { clusterItems, tokenize } = require('../src/pipeline/cluster');

const log = { debug() {}, info() {}, warn() {}, error() {} };
const makeItem = (title, canonical_url, outlet, description = '') => ({
  title,
  canonical_url,
  outlet,
  description,
  source_name: outlet,
  published: '2026-10-13T00:00:00Z',
});
const never = async () => false;

it('tokenizes without stopwords and with light stemming', () => {
  assert.deepStrictEqual(tokenize('The Fridges in French supermarkets were hit'), [
    'fridge', 'french', 'supermarket', 'hit',
  ]);
});

it('merges identical canonical URLs', async () => {
  const result = await clusterItems([
    makeItem('A', 'https://x.com/a', 'x.com'),
    makeItem('A again', 'https://x.com/a', 'reddit.com'),
  ], { judge: never, log });
  assert.deepStrictEqual(result.clusters.map(cluster => cluster.items.length), [2]);
  assert.strictEqual(result.stats.url_merges, 1);
});

it('merges syndicated copies by path and counts them as one outlet', async () => {
  const result = await clusterItems([
    makeItem('Bed bugs ground Qantas flight', 'https://www.smh.com.au/business/companies/bed-bugs-ground-qantas-rome-to-perth-flight-20261012-p614wy.html', 'smh.com.au'),
    makeItem('Bed bugs ground Qantas flight', 'https://www.theage.com.au/business/companies/bed-bugs-ground-qantas-rome-to-perth-flight-20261012-p614wy.html', 'theage.com.au'),
  ], { judge: never, log });
  assert.deepStrictEqual(result.clusters.map(cluster => [cluster.items.length, cluster.coverage]), [[2, 1]]);
});

// Differently worded headlines share only a few words; they reach the judge as
// borderline pairs. Unrelated items never reach it.
it('merges differently worded headlines about the same event via the judge', async () => {
  const asked = [];
  const yes = async (a, b) => { asked.push([a.title, b.title]); return true; };
  const result = await clusterItems([
    makeItem("French supermarkets suffer fridge shutdown after 'unprecedented' cyberattack", 'https://a.com/1', 'a.com'),
    makeItem('Fridges in French supermarkets hit by cyber attack', 'https://b.com/2', 'b.com'),
    makeItem('Cyberattack shuts down refrigerators at French supermarkets', 'https://c.com/3', 'c.com'),
    makeItem('Devonport Magistrates Court list, Monday', 'https://d.com/4', 'd.com'),
  ], { judge: yes, low: 0.15, log });
  assert.strictEqual(asked.some(pair => pair.includes('Devonport Magistrates Court list, Monday')), false);
  const sizes = result.clusters.map(cluster => cluster.items.length).sort();
  assert.deepStrictEqual(sizes, [1, 3]);
  assert.strictEqual(result.clusters.find(cluster => cluster.items.length === 3).coverage, 3);
});

it('asks the judge only for borderline pairs and respects maxChecks', async () => {
  let calls = 0;
  const judge = async () => { calls++; return true; };
  await clusterItems([
    makeItem('Council approves new Launceston bus interchange', 'https://a.com/1', 'a.com'),
    makeItem('Launceston interchange plan gets council nod', 'https://b.com/2', 'b.com'),
    makeItem('Bus fares rise in Hobart', 'https://c.com/3', 'c.com'),
  ], { judge, maxChecks: 1, low: 0.05, high: 0.99, log });
  assert.strictEqual(calls, 1);
});

it('treats a judge that throws as "no" and carries on', async () => {
  const result = await clusterItems([
    makeItem('Alpha beta gamma delta', 'https://a.com/1', 'a.com'),
    makeItem('Alpha beta gamma epsilon', 'https://b.com/2', 'b.com'),
  ], {
    judge: async () => { throw new Error('ollama down'); },
    low: 0.05,
    high: 0.99,
    log,
  });
  assert.deepStrictEqual(result.clusters.map(cluster => cluster.items.length), [1, 1]);
});

it('does not cluster a short title on title similarity alone', async () => {
  const asked = [];
  const pairs = [
    [makeItem('Tough Decisions', 'https://a.example/1', 'a.example'), makeItem("'Tough': RBA decision", 'https://b.example/2', 'b.example')],
  ];
  const results = [];
  for (const items of pairs) results.push(await clusterItems(items, {
    high: 0.01,
    low: 0,
    judge: async (a, b) => { asked.push([a.title, b.title]); return true; },
    log,
  }));
  assert.deepStrictEqual(results.map(result => result.clusters.map(cluster => cluster.items.map(value => value.title))), [
    [['Tough Decisions'], ["'Tough': RBA decision"]],
  ]);
  assert.deepStrictEqual(asked, []);
  const shared = await clusterItems([
    { ...makeItem('RBA decision shifts inflation fight', 'https://story.example/rba', 'reddit.com'), source_type: 'reddit', external_url: 'https://story.example/rba' },
    makeItem("'Tough': RBA decision shifts inflation fight", 'https://story.example/rba', 'news.example'),
  ], { judge: never, log });
  assert.deepStrictEqual(shared.clusters.map(cluster => cluster.items.map(value => value.title)), [[
    'RBA decision shifts inflation fight', "'Tough': RBA decision shifts inflation fight",
  ]]);
});

it('auto-merges only substantial event overlap with a shared fact and proper entity', async () => {
  const result = await clusterItems([
    makeItem('Australia defeats South Africa by 214 runs on day five in Durban', 'https://abc.example/result', 'abc.example', 'South Africa was bowled out after losing four wickets.'),
    makeItem("Selection critics silenced as Australia's old guard wins first Test", 'https://analysis.example/test', 'analysis.example', 'Australia beat South Africa by 214 runs in the first Test.'),
    makeItem('My small homelab in a 16U rack', 'https://reddit.com/r/homelab/1', 'reddit.com', 'A Dell Optiplex runs the server.'),
    makeItem('Dell Optiplex micro 3060', 'https://reddit.com/r/homelab/2', 'reddit.com', 'The 16GB server is a Dell Optiplex.'),
  ], { judge: never, high: 2, low: 2, log });
  assert.deepStrictEqual(result.clusters.map(cluster => cluster.items.map(value => value.title)), [
    [
      'Australia defeats South Africa by 214 runs on day five in Durban',
      "Selection critics silenced as Australia's old guard wins first Test",
    ],
    ['My small homelab in a 16U rack'],
    ['Dell Optiplex micro 3060'],
  ]);
  assert.deepStrictEqual(result.stats, {
    items: 4, clusters: 3, url_merges: 0, path_merges: 0,
    similar_merges: 1, judged: 0, judged_yes: 0,
  });
});
