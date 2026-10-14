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
