# Stage 2 — Better raw material — Implementation Plan

> **For agentic workers:** this plan is executed by Codex, dispatched task by
> task from Claude Code. Steps use checkbox (`- [ ]`) syntax for tracking.
> Codex cannot commit (its sandbox holds `.git` read-only); Claude commits
> after each task.

**Goal:** Replace "score 60 headlines, then fetch, then dedup" with
collect → normalise → filter → cluster → rank → extract, so repeats, filler
and stale items are gone before anything is chosen, and every chosen story
carries its full article text.

**Architecture:** Four new pure modules (`normalise`, `filter`, `cluster`,
`rank`) plus two helpers (`gnews` resolver, `sanitise` HTML), wired into
`src/pipeline/index.js` in place of `scorer.js` and `dedup.js`. The extractor
works on clusters and picks the best fetchable source per cluster. The
categoriser, summariser and assembler are untouched apart from receiving
clusters converted back to the item shape they already read.

**Tech Stack:** Node 22, CommonJS, `node:test`, better-sqlite3,
`@mozilla/readability`, `linkedom`, Ollama HTTP API. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-overhaul-design.md`, sections
"Pipeline, new order" steps 2–6.

## Global Constraints

- CommonJS (`'use strict'; module.exports = {...}`), matching existing files.
- No new npm dependencies.
- Tests: `npm test` (`node --test test/*.test.js`). Every new test must fail
  against the code before the task's change; show that failure. Assert whole
  values (exact arrays, exact strings, exact numbers), never substrings.
- Tests never touch the network; inject `fetchImpl` / `judge` / `now`.
- No per-site `if (host === ...)` branches in generic code. Site knowledge
  lives in settings defaults (paywalled hosts, filler patterns) or in the
  Google News resolver, which exists for that one site.
- Do not change the categoriser, summariser, assembler, database schema,
  source rows, or anything under `public/` except the Status-page stage list
  in Task 7.
- Settings defaults are code defaults read through `src/settings.js`; no
  migration writes them.

## Review Focus

1. **A source returns no `published` date** (Tasmania Police, some Google
   News items) — must be kept by the age filter, not dropped as stale.
   Test in Task 3.
2. **Two outlets publish the same syndicated story under different hosts**
   (SMH and The Age, identical paths) — one cluster, coverage counted once.
   Test in Task 4.
3. **Google News resolution fails or is blocked** — extract must fall back to
   the next item in the cluster, then to no article, never throw or stall the
   run. Test in Task 6.
4. **The local model is down during clustering** — borderline pairs stay
   unmerged and the run continues. Test in Task 4.
5. **One source floods the feed** (7NEWS and Press Start give ~100 items) —
   the rank floor still gives every source a look-in and the flood cannot take
   more than its share. Test in Task 5.

---

### Task 1: Item list position and Google News title suffix (normalise)

**Files:**
- Create: `src/pipeline/normalise.js`
- Modify: `src/pipeline/collector.js` (assign `list_position`)
- Test: `test/normalise.test.js`, `test/collector.test.js` (new)

**Interfaces:**
- Produces:
  - `canonicalUrl(url: string) → string|null`
  - `stripPublisherSuffix(title: string) → { title: string, publisher: string|null }`
  - `outletOf(item) → string`
  - `normalise(items: Item[]) → Item[]` — returns new objects with
    `canonical_url`, `outlet`, cleaned `title`; never mutates input.
  - collector: every collected item has `list_position` (1-based index in its
    source's returned list).

- [ ] **Step 1: Write the failing tests** (`test/normalise.test.js`)

```js
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
    assert.deepStrictEqual(stripPublisherSuffix("‘Tragic’: Breaking Bad star dead at 34 - News.com.au"),
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
```

`test/collector.test.js`: call `collect` with a fake db whose one source has
`type: 'rss'` and monkey-patch `require('../src/pipeline/sources/rss').fetchRSS`
**before** requiring the collector is not possible (destructured import), so
instead export `assignListPositions(items) → items` from `collector.js` and test
it directly:

```js
const { assignListPositions } = require('../src/pipeline/collector');
it('numbers items 1..n and keeps an existing list_position', () => {
  assert.deepStrictEqual(
    assignListPositions([{ t: 'a' }, { t: 'b', list_position: 9 }, { t: 'c' }]).map(i => i.list_position),
    [1, 9, 3]);
});
```

- [ ] **Step 2: Run tests, confirm they fail** — `npm test` → "Cannot find module '../src/pipeline/normalise'" and "assignListPositions is not a function".

- [ ] **Step 3: Implement**

`canonicalUrl`: `new URL`; lowercase hostname; clear `hash`; delete params
whose name matches `/^(utm_.*|ref|fbclid|gclid|mc_cid|mc_eid|cmp|ocid|s_cid)$/i`;
`toString()`; strip one trailing `/` unless the path is `/`. Return `null` on
throw or empty input.

`stripPublisherSuffix`: find the last `' - '`; suffix = text after it,
trimmed; if `0 < suffix.length <= 40` return the split, else unchanged with
`publisher: null`.

`outletOf(item)`: if `item.publisher` → `item.publisher.toLowerCase()`;
else hostname of `item.canonical_url` without leading `www.`; else
`item.source_name`.

`normalise`: for each item, `const isGoogle = /(^|\.)news\.google\.com$/i.test(host of item.url)`;
title = isGoogle ? stripped title : `item.title.trim()`; publisher only when
isGoogle; canonical = `canonicalUrl(item.source_type === 'reddit' ? (item.external_url || item.url) : item.url)`;
return `{ ...item, title, publisher, canonical_url: canonical, outlet: outletOf(...) }`.

`collector.js`: add `function assignListPositions(items) { return items.map((it, i) => it.list_position != null ? it : { ...it, list_position: i + 1 }); }`,
apply it to each `result.items` before `allItems.push(...)`, and export it
alongside `collect`.

- [ ] **Step 4: Run tests, confirm they pass** — `npm test`.

---

### Task 2: Settings for the new stages

**Files:**
- Modify: `src/settings.js`
- Test: `test/settings.test.js` (new)

**Interfaces:**
- Produces (on the object returned by `createSettings(db)`):
  - `getFilterMaxAgeHours() → number` (default `36`)
  - `getFillerPatterns() → string[]` (default list below)
  - `getPaywalledHosts() → string[]` (default list below)
  - `getMaxSameStoryChecks() → number` (default `40`)

Defaults (copy exactly):

```js
const DEFAULT_FILLER_PATTERNS = [
  'weather report for', 'magistrates court list', 'superquiz', 'best of cartoons',
  'crossword', 'horoscope', 'as it happened', 'quick quiz', 'word puzzle',
];
const DEFAULT_PAYWALLED_HOSTS = [
  'themercury.com.au', 'examiner.com.au', 'theadvocate.com.au', 'theaustralian.com.au',
];
```

- [ ] **Step 1: Write the failing test**

```js
const { createSettings } = require('../src/settings');
const fakeDb = (vals) => ({ getSetting: k => (k in vals ? vals[k] : null) });
it('returns defaults when unset', () => {
  const s = createSettings(fakeDb({}));
  assert.strictEqual(s.getFilterMaxAgeHours(), 36);
  assert.deepStrictEqual(s.getFillerPatterns(), ['weather report for', 'magistrates court list', 'superquiz', 'best of cartoons', 'crossword', 'horoscope', 'as it happened', 'quick quiz', 'word puzzle']);
  assert.deepStrictEqual(s.getPaywalledHosts(), ['themercury.com.au', 'examiner.com.au', 'theadvocate.com.au', 'theaustralian.com.au']);
  assert.strictEqual(s.getMaxSameStoryChecks(), 40);
});
it('returns stored values when set', () => {
  const s = createSettings(fakeDb({ filter_max_age_hours: 24, filler_patterns: ['x'], paywalled_hosts: [], max_same_story_checks: 5 }));
  assert.deepStrictEqual([s.getFilterMaxAgeHours(), s.getFillerPatterns(), s.getPaywalledHosts(), s.getMaxSameStoryChecks()], [24, ['x'], [], 5]);
});
```

- [ ] **Step 2: Run, confirm fail.** - [ ] **Step 3: Implement** the four getters following the existing `getMaxCuratedItems` pattern (`val !== null ? ... : default`). - [ ] **Step 4: Run, confirm pass.**

---

### Task 3: Filter — stale and filler

**Files:**
- Create: `src/pipeline/filter.js`
- Test: `test/filter.test.js`

**Interfaces:**
- Consumes: normalised items (Task 1); settings getters (Task 2).
- Produces: `filterItems(items, { maxAgeHours, fillerPatterns, sourceMaxAge, now }) → { kept: Item[], dropped: {item, reason}[], stats: { total, kept, stale, filler } }`
  - `sourceMaxAge`: `Map<source_name, hours>` built by the caller from
    `source.config.max_age_hours`.
  - `reason` is exactly `'stale'` or `'filler: <pattern>'`.

- [ ] **Step 1: Write the failing tests**

```js
const { filterItems } = require('../src/pipeline/filter');
const now = Date.parse('2026-10-13T00:00:00Z');
const opts = (o = {}) => ({ maxAgeHours: 36, fillerPatterns: ['weather report for', '/^superquiz,/i'], sourceMaxAge: new Map(), now, ...o });
const it_ = (title, hoursAgo, source_name = 'ABC') => ({ title, source_name,
  published: hoursAgo == null ? null : new Date(now - hoursAgo * 3600e3).toISOString() });

it('drops items older than the cut-off and keeps undated ones', () => {
  const r = filterItems([it_('fresh', 2), it_('old', 40), it_('undated', null)], opts());
  assert.deepStrictEqual(r.kept.map(i => i.title), ['fresh', 'undated']);
  assert.deepStrictEqual(r.dropped.map(d => [d.item.title, d.reason]), [['old', 'stale']]);
});
it('honours a per-source age override', () => {
  const r = filterItems([it_('slow source item', 100, 'Press Start Australia')],
    opts({ sourceMaxAge: new Map([['Press Start Australia', 168]]) }));
  assert.deepStrictEqual(r.kept.map(i => i.title), ['slow source item']);
});
it('drops filler by substring (case-insensitive) and by /regex/flags', () => {
  const r = filterItems([it_('Weather report for Devonport - The Mercury', 1), it_('Superquiz, Tuesday, October 13', 1), it_('Superquiz winner speaks', 1)], opts());
  assert.deepStrictEqual(r.dropped.map(d => d.reason), ['filler: weather report for', 'filler: /^superquiz,/i']);
  assert.deepStrictEqual(r.kept.map(i => i.title), ['Superquiz winner speaks']);
  assert.deepStrictEqual(r.stats, { total: 3, kept: 1, stale: 0, filler: 2 });
});
it('ignores an invalid regex pattern instead of throwing', () => {
  const r = filterItems([it_('anything', 1)], opts({ fillerPatterns: ['/([/'] }));
  assert.deepStrictEqual(r.kept.map(i => i.title), ['anything']);
});
```

- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement.** Compile patterns once: a pattern of the form `/body/flags` becomes `new RegExp(body, flags)` inside try/catch (skip on error); anything else is a lower-cased substring. Stale check first (`published` parses and `now - published > hours*3600e3`, where hours = `sourceMaxAge.get(source_name) ?? maxAgeHours`), then filler on `title`.
- [ ] **Step 4: Run, confirm pass.**

---

### Task 4: Cluster — same story from different outlets

**Files:**
- Create: `src/pipeline/cluster.js`, `src/pipeline/sameStory.js`
- Test: `test/cluster.test.js`

**Interfaces:**
- Consumes: kept items from Task 3.
- Produces:
  - `tokenize(text) → string[]`
  - `clusterItems(items, { judge, high, low, maxChecks, log }) → Promise<{ clusters: Cluster[], stats: { items, clusters, url_merges, path_merges, similar_merges, judged, judged_yes } }>`
  - `Cluster = { id: string, items: Item[], lead: Item, coverage: number, outlets: string[] }`
  - `judge(a: Item, b: Item) → Promise<boolean>`; `sameStory.makeJudge(ollama, settings, log) → judge`.
  - Defaults: `high = 0.5`, `low = 0.3`, `maxChecks` from settings. Task 8 retunes `high`/`low` against the saved day and moves the final values into module constants.

- [ ] **Step 1: Write the failing tests**

```js
const { clusterItems, tokenize } = require('../src/pipeline/cluster');
const log = { debug() {}, info() {}, warn() {}, error() {} };
const mk = (title, canonical_url, outlet, description = '') => ({ title, canonical_url, outlet, description, source_name: outlet, published: '2026-10-13T00:00:00Z' });
const never = async () => false;

it('tokenizes without stopwords and with light stemming', () => {
  assert.deepStrictEqual(tokenize('The Fridges in French supermarkets were hit'), ['fridge', 'french', 'supermarket', 'hit']);
});
it('merges identical canonical URLs', async () => {
  const r = await clusterItems([mk('A', 'https://x.com/a', 'x.com'), mk('A again', 'https://x.com/a', 'reddit.com')], { judge: never, log });
  assert.deepStrictEqual(r.clusters.map(c => c.items.length), [2]);
  assert.strictEqual(r.stats.url_merges, 1);
});
it('merges syndicated copies by path and counts them as one outlet', async () => {
  const r = await clusterItems([
    mk('Bed bugs ground Qantas flight', 'https://www.smh.com.au/business/companies/bed-bugs-ground-qantas-rome-to-perth-flight-20261012-p614wy.html', 'smh.com.au'),
    mk('Bed bugs ground Qantas flight', 'https://www.theage.com.au/business/companies/bed-bugs-ground-qantas-rome-to-perth-flight-20261012-p614wy.html', 'theage.com.au'),
  ], { judge: never, log });
  assert.deepStrictEqual(r.clusters.map(c => [c.items.length, c.coverage]), [[2, 1]]);
});
// Differently worded headlines share only a few words; they reach the judge as
// borderline pairs. Unrelated items never reach it.
it('merges differently worded headlines about the same event via the judge', async () => {
  const asked = [];
  const yes = async (a, b) => { asked.push([a.title, b.title]); return true; };
  const r = await clusterItems([
    mk("French supermarkets suffer fridge shutdown after 'unprecedented' cyberattack", 'https://a.com/1', 'a.com'),
    mk('Fridges in French supermarkets hit by cyber attack', 'https://b.com/2', 'b.com'),
    mk('Cyberattack shuts down refrigerators at French supermarkets', 'https://c.com/3', 'c.com'),
    mk('Devonport Magistrates Court list, Monday', 'https://d.com/4', 'd.com'),
  ], { judge: yes, low: 0.15, log });
  assert.strictEqual(asked.some(p => p.includes('Devonport Magistrates Court list, Monday')), false);
  const sizes = r.clusters.map(c => c.items.length).sort();
  assert.deepStrictEqual(sizes, [1, 3]);
  assert.strictEqual(r.clusters.find(c => c.items.length === 3).coverage, 3);
});
it('asks the judge only for borderline pairs and respects maxChecks', async () => {
  let calls = 0;
  const judge = async () => { calls++; return true; };
  await clusterItems([
    mk('Council approves new Launceston bus interchange', 'https://a.com/1', 'a.com'),
    mk('Launceston interchange plan gets council nod', 'https://b.com/2', 'b.com'),
    mk('Bus fares rise in Hobart', 'https://c.com/3', 'c.com'),
  ], { judge, maxChecks: 1, low: 0.05, high: 0.99, log });
  assert.strictEqual(calls, 1);
});
it('treats a judge that throws as "no" and carries on', async () => {
  const r = await clusterItems([mk('Alpha beta gamma delta', 'https://a.com/1', 'a.com'), mk('Alpha beta gamma epsilon', 'https://b.com/2', 'b.com')],
    { judge: async () => { throw new Error('ollama down'); }, low: 0.05, high: 0.99, log });
  assert.deepStrictEqual(r.clusters.map(c => c.items.length), [1, 1]);
});
```

- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement `cluster.js`.**
  - `tokenize`: lowercase; replace `[^\p{L}\p{N}\s]` (unicode flag) with space; split on whitespace; drop stopwords (a fixed English list of ~120 words including `the, a, an, in, on, at, of, to, for, by, with, after, over, as, is, are, was, were, be, been, and, or, but, from, into, its, it, this, that, these, those, new, says, said, will, has, have, had, his, her, their, our, more, than, up, down, out, about, amid, who, what, why, how`); stem: if length > 4 strip the first matching suffix of `ing`, `ed`, `s` (never strip the `s` of a word ending in `ss`); drop tokens shorter than 3 characters unless all digits.
  - Union-find over item indices (reuse the pattern from the old `dedup.js`).
  - Pass A: group by `canonical_url` (non-null); union all; count `url_merges += size-1`.
  - Pass B: group by `pathname` of `canonical_url` when the path is at least 25 characters long; union; `path_merges`; record each such group's outlets as one syndication set (second union-find over outlets).
  - Pass C: TF-IDF over documents `title + ' ' + description.slice(0, 300)` (IDF computed over this run's items, `log((N+1)/(df+1)) + 1`), cosine between every pair of current roots' lead documents. `>= high` → union (`similar_merges++`). `>= low && < high` → collect as borderline; sort borderline by similarity descending; call `judge` for up to `maxChecks` of them (`judged++`, `judged_yes++` on true; catch errors → false, `log.warn`).
  - Build clusters: `lead` = item with the highest source priority (`item.source_priority ?? 1`), then longest `description`; `outlets` = distinct outlet values; `coverage` = number of distinct outlets after collapsing syndication sets; `id` = `canonical_url` of the lead or `title` if none.
- [ ] **Step 4: Implement `sameStory.js`:** `makeJudge(ollama, settings, log)` returns `async (a, b) => {...}` calling `ollama.generate(settings.getOllamaUrl(), settings.getOllamaModel(), prompt, { temperature: 0, num_predict: 5 })` with the prompt below; true iff the trimmed response starts with `YES` (case-insensitive).

```
Two news items are below. Answer YES if they report the same news event (the same incident, announcement or decision), even if they are worded differently or one has more detail. Answer NO if they are different events, even on the same topic. Reply with one word: YES or NO.

Item 1: <title a>
<description a, first 300 chars>

Item 2: <title b>
<description b, first 300 chars>
```

- [ ] **Step 5: Run, confirm pass.**

---

### Task 5: Rank — score clusters and pick candidates

**Files:**
- Create: `src/pipeline/rank.js`
- Test: `test/rank.test.js`

**Interfaces:**
- Consumes: `Cluster` from Task 4; `recencyScore` and `keywordBonus` — copy them from `scorer.js` into `rank.js` (scorer.js is deleted in Task 7).
- Produces: `rankClusters(clusters, { now, boostKeywords, penaltyKeywords, limit, perSourceFloor = 2 }) → { selected: RankedCluster[], dropped: RankedCluster[], stats: { clusters, selected, floor_added } }`, where `RankedCluster = Cluster & { rank_score: number, rank: number }` and `selected` is sorted by `rank_score` descending with `rank` 1..n.

Score (exact):
```
coverageScore = 25 * Math.log2(Math.max(1, coverage))
recency       = recencyScore(newest item)            // 5..40, 20 when undated
position      = best over items: list_position <= 3 → 15, <= 10 → 10, <= 25 → 5, else 0
keywords      = keywordBonus(lead, { boost_keywords, penalty_keywords })
priority      = max over items of (item.source_priority ?? 1)
rank_score    = Math.max(0, (coverageScore + recency + position + keywords) * priority)
```

- [ ] **Step 1: Write the failing tests**

```js
const { rankClusters } = require('../src/pipeline/rank');
const now = Date.parse('2026-10-13T00:00:00Z');
const c = (id, { coverage = 1, hoursAgo = 2, pos = 50, source = 'S', priority = 1 } = {}) => {
  const item = { title: id, description: '', source_name: source, source_priority: priority, list_position: pos, published: new Date(now - hoursAgo * 3600e3).toISOString() };
  return { id, items: [item], lead: item, coverage, outlets: [source] };
};
it('scores coverage, recency and position exactly', () => {
  const r = rankClusters([c('x', { coverage: 4, hoursAgo: 1, pos: 2 })], { now, limit: 10 });
  assert.strictEqual(r.selected[0].rank_score, 50 + 40 + 15);
});
it('puts a story carried by four outlets above a fresher single-outlet story', () => {
  const r = rankClusters([c('single', { hoursAgo: 1 }), c('big', { coverage: 4, hoursAgo: 12 })], { now, limit: 10 });
  assert.deepStrictEqual(r.selected.map(x => x.id), ['big', 'single']);
});
it('gives every source a floor of two even when one source floods', () => {
  const flood = Array.from({ length: 10 }, (_, i) => c('flood' + i, { source: '7NEWS', hoursAgo: 1, pos: 1 }));
  const quiet = [c('q1', { source: 'Examiner', hoursAgo: 30 }), c('q2', { source: 'Examiner', hoursAgo: 31 }), c('q3', { source: 'Examiner', hoursAgo: 32 })];
  const r = rankClusters([...flood, ...quiet], { now, limit: 5 });
  assert.strictEqual(r.selected.length, 5);
  assert.deepStrictEqual(r.selected.filter(x => x.lead.source_name === 'Examiner').map(x => x.id).sort(), ['q1', 'q2']);
  assert.strictEqual(r.stats.floor_added, 2);
});
```

- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement.** Score all; sort descending. Floor: for each `source_name` appearing in any cluster's items, take its top `perSourceFloor` clusters (by score) into `selected` (dedupe by `id`); `floor_added` counts those not already in the top `limit` by score. Fill the remaining `limit - selected.length` slots from the sorted list; if the floor alone exceeds `limit`, keep the floor's highest-scoring `limit` clusters. Sort `selected`, assign `rank`. Everything else goes to `dropped`.
- [ ] **Step 4: Run, confirm pass.**

---

### Task 6: Extract per cluster — Google News, paywalls, clean HTML

**Files:**
- Create: `src/pipeline/gnews.js`, `src/pipeline/sanitise.js`
- Modify: `src/pipeline/extractor.js`
- Test: `test/gnews.test.js`, `test/sanitise.test.js`, `test/extractor.test.js`

**Interfaces:**
- Produces:
  - `gnews.isGoogleNewsUrl(url) → boolean`
  - `gnews.resolveGoogleNewsUrl(url, { fetchImpl }) → Promise<string|null>`
  - `sanitise.sanitiseHtml(html: string) → string`
  - `extractor.extractClusters(clusters, settings, log, emitProgress, { fetchImpl } = {}) → Promise<{ clusters, stats: { attempted, articles, comments, failures, gnews_resolved, gnews_failed } }>` — sets on each cluster: `article_text`, `article_html`, `article_url`, `top_comments` (reddit lead only).
  - The existing `extract(items, ...)` export may stay for its tests; the pipeline stops calling it.

Google News resolution (verified 2026-10-13):
1. `id` = last path segment of the article URL.
2. GET `https://news.google.com/rss/articles/<id>` with the browser User-Agent; read `data-n-a-sg="…"` and `data-n-a-ts="…"` from the HTML.
3. POST `https://news.google.com/_/DotsSplashUi/data/batchexecute`, `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`, body `f.req=` + `encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]))` where
   `inner = '["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"' + id + '",' + ts + ',"' + sg + '"]'`.
4. The publisher URL is the capture of `/\\"garturlres\\",\\"(https?:[^\\"]+)\\"/` in the response text.
5. Any missing attribute, non-200 or no match → `null`. At most 2 resolutions in flight at once.

- [ ] **Step 1: Write the failing tests**

`test/gnews.test.js` — fake `fetchImpl` that returns, for the GET, HTML containing `data-n-a-sg="SIG" data-n-a-ts="123"`, and for the POST, the text `)]}'\n[["wrb.fr","Fbv4je","[\"garturlres\",\"https://www.news.com.au/x/news-story/abc\",1]",null,null,null,"generic"]]`; assert it resolves to `'https://www.news.com.au/x/news-story/abc'`, that the POST body contains `"CBMiabc",123,"SIG"` once decoded (compare the decoded `f.req` JSON exactly), and that a GET without the attributes resolves to `null` without a POST.

`test/sanitise.test.js`:

```js
const { sanitiseHtml } = require('../src/pipeline/sanitise');
it('keeps reading tags, strips scripts, handlers and unknown attributes', () => {
  assert.strictEqual(
    sanitiseHtml('<div class="x"><p onclick="evil()">Hi <a href="https://a.com" style="c">there</a></p><script>bad()</script><iframe src="x"></iframe><img src="http://insecure/i.jpg"><img src="https://ok/i.jpg" alt="A"></div>'),
    '<p>Hi <a href="https://a.com" rel="noopener noreferrer" target="_blank">there</a></p><img src="https://ok/i.jpg" alt="A">');
});
it('drops javascript: links but keeps their text', () => {
  assert.strictEqual(sanitiseHtml('<p><a href="javascript:x()">t</a></p>'), '<p>t</p>');
});
```

`test/extractor.test.js` — add `extractClusters` cases with a fake `fetchImpl` and a fake settings object (`getPaywalledHosts: () => ['examiner.com.au']`):
1. A cluster with items from `examiner.com.au` (priority 2) and `abc.net.au` (priority 1) fetches only the ABC URL and sets `article_url` to it.
2. A cluster whose only item is a Google News URL: resolver returns a publisher URL, the article is fetched from that URL, `stats.gnews_resolved === 1`.
3. A cluster whose Google News resolution fails and whose second item is a plain URL: the second item's article is used, `stats.gnews_failed === 1`.
4. A cluster where every fetch fails: `article_text === null`, `stats.failures === 1`, no throw.
5. Article text under 400 characters counts as a failure and tries the next item.

- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement `gnews.js`, `sanitise.js`** (walk the linkedom DOM; allowed tags `p h2 h3 h4 ul ol li blockquote strong em b i a img figure figcaption br`; remove `script style iframe form noscript svg button input select textarea object embed` with their contents; unwrap any other element (keep children); allowed attributes: `a[href]` http/https only, plus added `rel="noopener noreferrer" target="_blank"`; `img[src]` https only and `img[alt]`; drop `img` without an allowed src).
- [ ] **Step 4: Implement `extractClusters`.** Order a cluster's items: not-paywalled hosts first (host of `canonical_url`, `www.` stripped, compared to the paywalled list), then by `source_priority` descending. Try up to 3 items: Google News URLs resolve first (failure → next item); fetch with the existing `fetchWithTimeout` (browser User-Agent, 10 s); Readability `parse()`; success when `textContent.trim().length >= 400` → `article_text` = text, `article_html` = `sanitiseHtml(article.content)`, `article_url` = final URL. Reddit lead with a reddit permalink: also fetch comments as `extract` does today. Concurrency 5 clusters; Google resolutions limited to 2 at a time via a small shared semaphore. Emit `emitProgress('extract', done, total)`. Log one INFO summary: `Extracted <n> stories: <a> articles, <c> comment sets, <f> failures, Google News <r> resolved / <g> failed`.
- [ ] **Step 5: Run, confirm pass.**

---

### Task 7: Wire the new pipeline and the Status page

**Files:**
- Modify: `src/pipeline/index.js`, `public/app.js` (stage list block at lines ~1488–1635 only)
- Delete: `src/pipeline/scorer.js`, `src/pipeline/dedup.js`, `test/scorer.test.js`, `test/dedup.test.js`
- Create: `src/pipeline/toItem.js`
- Test: `test/toItem.test.js`, `test/pipeline-order.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `toItem(rankedCluster) → Item` in the shape the categoriser and summariser read:
  `{ ...lead, title: lead.title, description: lead.description, sources: items.map(i => ({ name: i.source_name, url: i.url })), merged_descriptions: distinct non-empty descriptions (lead first), image: first non-null image (lead first), published: newest, relevance_score: rank_score, article_content: article_text, article_html, article_url, canonical_url: lead.canonical_url, top_comments }`.

- [ ] **Step 1: Write failing tests** — `toItem` exact-object test for a two-item cluster; `pipeline-order.test.js` reads `src/pipeline/index.js` source and asserts the exact ordered list of `emit({ type: 'stage', stage: '<x>', status: 'running' })` stage names is `['collect','filter','cluster','rank','extract','categorise','summarise','assemble']`.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement the pipeline order:**
  1. `collect` (unchanged). Attach `source_priority` to each item from the enabled source rows (`db.getEnabledSources()`, keyed by `name`).
  2. stage `filter`: `normalise` then `filterItems` with settings getters and `sourceMaxAge` from `source.config.max_age_hours`. Log each drop at DEBUG (`Dropped "<title>" (<reason>)`) and one INFO: `Filtered <total> items: <kept> kept, <stale> stale, <filler> filler`.
  3. stage `cluster`: `clusterItems(kept, { judge: makeJudge(ollama, settings, runLog), maxChecks: settings.getMaxSameStoryChecks(), log: runLog })`; INFO `Clustered <items> items into <clusters> stories: <url> same link, <path> syndicated, <similar> similar, <judged_yes>/<judged> confirmed by model`.
  4. stage `rank`: `rankClusters(clusters, { now: Date.now(), boostKeywords, penaltyKeywords, limit: settings.getMaxCuratedItems() })`; INFO `Ranked <clusters> stories: <selected> selected (<floor_added> by source floor)`. `db.updateRun(runId, { items_scored: selected.length })`.
  5. stage `extract`: `extractClusters(selected, ...)`, then `selected.map(toItem)`.
  6. `categorise`, `summarise`, `assemble` unchanged.
  Keep `checkCancelled()` between stages and the existing emit/SSE/progress pattern.
- [ ] **Step 4: Status page.** In `public/app.js` set `PIPELINE_STAGES = ['Collect', 'Filter', 'Cluster', 'Rank', 'Extract', 'Categorise', 'Summarise', 'Assemble']`; descriptions `filter: 'Dropping old news and filler'`, `cluster: 'Grouping the same story from different outlets'`, `rank: 'Choosing the stories worth writing up'`, `extract: 'Fetching the full articles'`; `STAGE_COMPLETE_PATTERNS` `filter: /^Filtered \d+ items:/`, `cluster: /^Clustered \d+ items/`, `rank: /^Ranked \d+ stories:/`, `extract: /^Extracted \d+ stories:/`; components `filter: 'pipeline:filter'`, `cluster: 'pipeline:cluster'`, `rank: 'pipeline:rank'`, `extract: 'pipeline:extract'` — and use exactly those component names in the INFO log calls of step 3. Remove the `score` and `dedup` entries. If the page has a per-stage icon map, add entries for the new keys reusing existing icons.
- [ ] **Step 5: Run the whole suite, confirm pass.**

---

### Task 8: Regression day — tune and pin the thresholds

**Files:**
- Fixture (provided by Claude before dispatch): `test/fixtures/day-2026-10-13/collected.json` — `{ captured_at, sources: [{name,type,priority,config}], items: [...] }`, raw output of `collect` on the dev container with prod's 26 sources.
- Expectations (written by Claude before dispatch, listing only pairs that word overlap alone should settle — pairs that need the model are checked on the dev run instead): `test/fixtures/day-2026-10-13/expect.json` —
  `{ "same_story": [[titleA, titleB], ...], "different_story": [[titleA, titleB], ...], "dropped_filler": [title, ...] }`.
- Create: `test/regression-day.test.js`
- Modify: `src/pipeline/cluster.js` (final `high`/`low` constants)

- [ ] **Step 1:** Write the test: load the fixture; attach `source_priority` from `sources`; run `normalise` → `filterItems` (with `now = Date.parse(captured_at)` and default settings values) → `clusterItems` with `judge` always `false`. Assert: every `dropped_filler` title is in `dropped` with a `filler:` reason; every `same_story` pair lands in one cluster; no `different_story` pair shares a cluster.
- [ ] **Step 2:** Run. If it fails, adjust only `high` and `low` (and, if needed, the stopword list) until it passes; never edit the fixture or expectations. If no thresholds satisfy both `same_story` and `different_story`, stop and report the conflicting pairs with their similarity scores instead of forcing it.
- [ ] **Step 3:** Run the whole suite, confirm pass. Report the chosen thresholds and the cluster count for the day.

---

### After the tasks (Claude, not Codex)

1. Build `daily-briefing-dev`, run the pipeline, read the run log.
2. Compare against the prod briefing for the same morning: repeats, filler,
   stale items, articles fetched, Google News resolved.
3. Give Jesse a numbered check list, then wait for his verdict before stage 3.
