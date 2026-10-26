# Interest Quiz Implementation Plan

> **For agentic workers:** Execution here is by Codex dispatch from Claude (house rule), one task or a small batch per job, with Claude reviewing and committing between jobs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Tune your paper" quiz in the app that shows ~180 real headlines from a much wider set of places than the paper reads, records I'd read / Maybe / Not for me, and turns the answers into a results page of yes/no proposals (interests, sources, new sections) that change nothing until accepted.

**Architecture:** New `src/quiz/` modules: a catalogue of discovery feeds (data), a tagger (one batched local-model call per chunk), a pure picker, a round builder job, pure scoring, and a proposal writer. New additive tables. New `/api/quiz/*` routes and a `/tune` Paper-look view in the SPA, with its pure logic in `public/quiz-logic.js`. Sections become "built-ins plus custom sections from settings" behind one accessor.

**Tech Stack:** Node 22, Express, better-sqlite3, vanilla JS SPA, Ollama (`gemma4:26b` via existing `src/ollama.js`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-26-interest-quiz-design.md`

## Global Constraints

- Schema changes are additive only (`CREATE TABLE IF NOT EXISTS`); prod DB is real data.
- Quiz answers are never written to `story_events`; quiz never changes "You should know" rules.
- Nothing changes interests, sources or sections except an explicit per-proposal yes.
- Start is refused 03:30–05:30 in the app's timezone (`settings.getTimezone()`); round building pauses while `pipeline.isRunning()`.
- Round size 180; minimum built round 60; later rounds never repeat an answered headline.
- Every area gets at least 4 headlines; no more than two from one area in a row; about a quarter from the paper's own sources.
- Scoring: read = 1, maybe = 0.5, no = 0, skip ignored. Thin < 4 answers. Settled ≥ 6 answers and score ≤ 0.2 or ≥ 0.8. Mixed otherwise.
- Source proposal: an outlet with ≥ 3 "read" answers and read rate ≥ the round's overall rate; outlets already followed are never proposed.
- Section proposal: area (or close pair) with ≥ 8 answers, score ≥ 0.7, ≥ 2 outlets to fill it; reasons stated in plain words with the numbers.
- Outlet names shown without the " (Google News)" suffix.
- Paper look (cream, serif) as the existing reading screen; works at 390, 768 and 1280 px widths.
- On-screen text is short, plain and warm; no asides; dates en-AU.
- Tests must not touch the network. New tests must fail against pre-change code; assert whole values, not substrings.
- Code comments explain why; match the surrounding style.

## Review Focus

1. **Server restarts mid-build** — a round left `building` must not hang forever: on startup, mark it `failed` with "The app restarted while gathering headlines" so Try again appears. (Task 4)
2. **Local model down or wrong model** — if tagging fails for more than half the pre-sample, the round fails plainly; if it fails for some, those items keep distance from place matching and `story_type = null` and still count. (Task 2, Task 4)
3. **Fast or double taps** — answering the same position twice overwrites, never duplicates; undo after the last answer of a round reopens it. (Task 3, Task 5)
4. **Accepting a proposal that collides** — an interest whose label already exists is merged (terms unioned, weight set) not duplicated; a source whose feed URL already exists is reported "already in your paper" and not added twice; deciding the same proposal twice is a no-op. (Task 9)
5. **A custom section later removed** — stories and sources mapped to it fall back to `internet`; old editions that name it still render with their stored title. (Task 8)

---

### Task 1: Discovery catalogue and feed trial

**Files:**
- Create: `src/quiz/areas.js`, `src/quiz/catalogue.js`, `scripts/quiz-trial-feeds.js`
- Test: `test/quiz-catalogue.test.js`

**Interfaces:**
- Produces: `AREAS: ReadonlyArray<{id, title, section}>` (section = built-in section id or `'internet'`); `CATALOGUE: ReadonlyArray<{key, name, url, kind: 'rss'|'reddit', area}>`; `catalogueSources(): Source[]` shaped like rows from `db.getEnabledSources()` so `collect(db, log, emit, { sources })` accepts them.

- [ ] **Step 1:** Test: every catalogue entry's `area` is in `AREAS`; keys unique; ≤ 10 `reddit` entries; every area in the spec's list (`West Tamar/Launceston, Tasmania, Australia politics, Australia general, world, world politics, business & money, property, personal finance, tech industry, security, AI, self-hosting & homelab, maker/DIY, home automation, gaming mainstream, gaming indie, science, space, health, environment & climate, cars & EVs, energy & solar, food & cooking, sport AFL, sport cricket, sport other, history, culture/film/TV/music, odd news, internet culture & trends, long reads`) has ≥ 3 entries; `catalogueSources()` rows have the fields `collect` reads.
- [ ] **Step 2:** Run `node --test test/quiz-catalogue.test.js` — FAIL (module missing).
- [ ] **Step 3:** Write the areas and 100–150 feeds. Prefer outlets' own RSS; Google News topic/search feeds where no RSS exists. Area → section table: places → `tasmania`/`australia`, world → `world`, tech/security/AI → `tech`, self-hosting/home automation/maker → `homelab`, gaming → `gaming`, sport → `sport`, everything else → `internet`.
- [ ] **Step 4:** Write `scripts/quiz-trial-feeds.js`: fetch every entry with the existing fetchers, print per feed: OK/failed, items in last 7 days, 3 sample titles; exit 0. Run inside the dev container by Claude, not in tests.
- [ ] **Step 5:** Tests pass; full `npm test` passes.
- [ ] **Step 6 (Claude):** Run the trial in `daily-briefing-dev`; drop failing or junk feeds; record the result table at the end of this plan.

### Task 2: Tagger and tagger trial

**Files:**
- Create: `src/quiz/tag.js`, `scripts/quiz-trial-tagger.js`
- Test: `test/quiz-tag.test.js`

**Interfaces:**
- Consumes: `ollama.generate(url, model, prompt, options)`; `matchTasmanianPlaces` / interest place matching from `src/pipeline/writer/tasmanian-places.js` and `interests.js`.
- Produces: `STORY_TYPES = ['made','explainer','update','analysis','announcement','human','guide','discussion','roundup']`; `DISTANCES = ['home','tasmania','australia','overseas','na']`; `async tagItems(items, { generate, model, url, batchSize = 20 }) → Array<{story_type: string|null, distance: string}>` same order and length as input; `placeDistance(item) → string`.

- [ ] **Step 1:** Tests with a stubbed `generate`: a batch reply maps by index; an unknown story type becomes `null`; a malformed batch reply falls back to `placeDistance` + `null` for that batch only; "Beaconsfield" → `home`, "Hobart" → `tasmania`, a non-place headline with no model answer → `na`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. One prompt per batch asking for a JSON array of `{i, type, distance}`; parse strictly; model distance is overridden by `placeDistance` when that finds a home or Tasmanian place.
- [ ] **Step 4:** `scripts/quiz-trial-tagger.js`: collect from enabled sources + catalogue, take 200 recent headlines across areas, tag them, print a table and the counts per type/distance.
- [ ] **Step 5:** Tests pass; full suite passes.
- [ ] **Step 6 (Claude):** Run the trial in dev; judge the tags; show Jesse the odd ones in plain words before Task 4 relies on the tagger.

### Task 3: Storage

**Files:**
- Modify: `src/db.js` (schema + methods next to the `story_events` block)
- Test: `test/quiz-db.test.js`

**Interfaces:**
- Produces on the db object: `createQuizRound() → id`; `updateQuizRound(id, {status, built_at?, finished_at?, error?, progress?})`; `getOpenQuizRound() → round|null` (status `building|ready|answering`); `listQuizRounds()`; `insertQuizItems(roundId, items[])`; `getQuizItems(roundId)`; `setQuizAnswer(roundId, position, answer)` (upsert, `answer ∈ read|maybe|no|skip`); `deleteQuizAnswer(roundId, position)`; `getQuizAnswers(roundId)`; `answeredQuizUrls() → Set<string>` (all rounds); `insertQuizProposals(roundId, proposals[])`; `getQuizProposals(roundId)`; `decideQuizProposal(id, 'yes'|'no') → {changed: boolean}`; `failStaleQuizBuilds(message)`.
- Tables exactly as the spec, plus `quiz_rounds.progress TEXT` (JSON) and a unique `(round_id, position)` on `quiz_answers`.

- [ ] **Step 1:** Tests on an in-memory DB: create → open round; answer upsert overwrites (Review Focus 3); delete answer; `answeredQuizUrls` spans rounds; deciding twice returns `{changed:false}` the second time; `failStaleQuizBuilds` turns `building` into `failed` with the message (Review Focus 1); `story_events` row count unchanged by all of it.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Pass + full suite.

### Task 4: Round builder

**Files:**
- Create: `src/quiz/pick.js` (pure), `src/quiz/build.js`
- Modify: `server.js` (call `db.failStaleQuizBuilds('The app restarted while gathering headlines')` at startup)
- Test: `test/quiz-pick.test.js`, `test/quiz-build.test.js`

**Interfaces:**
- Consumes: Task 1 `catalogueSources`, `AREAS`; Task 2 `tagItems`; Task 3 db methods; `collect`, `filterItems`, `clusterItems`; `pipeline.isRunning`.
- Produces: `preSample(candidates, { size = 400, minPerArea = 4, rng }) → candidates[]`; `pickRound(tagged, { size = 180, minPerArea = 4, paperShare = 0.25, weights?: Map<area, number>, exclude: Set<url>, rng }) → items[]` ordered for display; `startRound({ db, settings, log, ollama, pipeline, now }) → {roundId} | {refused: string}`.

- [ ] **Step 1:** Pick tests with a seeded rng: each area with enough candidates gets ≥ 4; no three in a row from one area; paper-source share within 0.2–0.3; excluded URLs never picked; pool of 70 → round of 70; pool of 50 → `[]`; distance-probe pairs (same area + type, `home|tasmania` vs `australia|overseas`) appear when available.
- [ ] **Step 2:** Build tests with stubbed collect/tag: Start at 04:15 local → `{refused: 'The morning paper is being made. Try again after 5:30.'}`; an open round → returns it instead of a new one; tagging failing for > half → round `failed` with "Couldn't sort the headlines. Try again."; build waits while `isRunning()` is true and continues after; progress JSON updates `{stage, done, total}`; a round under 60 → `failed` with "Not enough new headlines yet. Try again in a few days."
- [ ] **Step 3:** Run — FAIL. **Step 4:** Implement: collect (paper sources + catalogue) → filter (7-day max age, existing filler patterns) → cluster with `judge` left default (no model) → drop answered URLs → preSample → tag → pickRound → `insertQuizItems` → status `ready`. Runs detached; Start returns immediately.
- [ ] **Step 5:** Pass + full suite.

### Task 5: Quiz API

**Files:**
- Create: `src/routes/quiz.js`; Modify: `server.js` (mount at `/api`)
- Test: `test/quiz-route.test.js`

**Interfaces:**
- Produces: `POST /api/quiz/start` → `{round}` or 409 `{error}` (refusal text); `GET /api/quiz/current` → `{round, items, answers}` or `{round: null}`; `PUT /api/quiz/rounds/:id/answers/:position` body `{answer}`; `DELETE` same path (undo); `POST /api/quiz/rounds/:id/finish` → runs Task 7 and returns `{proposals}`; `GET /api/quiz/rounds/:id/results`; `POST /api/quiz/proposals/:id` body `{decision}` → Task 9 apply.

- [ ] **Step 1:** Route tests: bad answer value → 400; answer on a finished round → 409; undo of the last answer on a finished round reopens it (Review Focus 3); finish with zero answers → 400 "Answer a few first".
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** Pass + full suite.

### Task 6: Quiz screen `/tune`

**Files:**
- Create: `public/quiz-logic.js` (pure, UMD like `reading-logic.js`)
- Modify: `public/app.js` (router entry `/tune`, view), `public/index.html`, `public/style.css`, `public/sw.js` (cache list)
- Test: `test/quiz-logic.test.js`

**Interfaces:**
- Consumes: Task 5 API.
- Produces: `QuizLogic.outletName(name) → string` (strips " (Google News)"); `QuizLogic.teaserWorthShowing(title, teaser) → boolean` (false when teaser is the headline again or empty); `QuizLogic.nextPosition(items, answers) → number|null`; `QuizLogic.progressLabel(done, total) → '47 of 180'`.

- [ ] **Step 1:** Pure tests for the four functions with exact strings.
- [ ] **Step 2:** FAIL. **Step 3:** Implement the view: building state with progress ("Gathering headlines… 64 of 140 places read") and Try again on failure; card (headline, outlet, teaser if worth showing); buttons "I'd read this", "Maybe", "Not for me"; "Skip" text link; "Undo"; progress line; "See my results" when done or after ≥ 40 answers.
- [ ] **Step 4:** Pass + full suite.
- [ ] **Step 5 (Claude):** Drive dev in a browser at 390/768/1280.

### Task 7: Scoring and proposals

**Files:**
- Create: `src/quiz/score.js` (pure), `src/quiz/propose.js`
- Test: `test/quiz-score.test.js`, `test/quiz-propose.test.js`

**Interfaces:**
- Consumes: Task 3 items/answers; `normaliseInterests` from `src/settings.js`; `detectSource` from `src/sourceDetect.js`; `gnews` link resolution; `ollama.generate`.
- Produces: `areaWeights(scores) → Map<area, number>` (thin ×2, mixed ×1.5, settled ×0.5), wired into `startRound` from the latest finished round's scores; `scoreRound(items, answers) → {overall, byArea: Map<area,{n, score, state: 'thin'|'mixed'|'settled'}>, byType, byDistance, byOutlet: Map<outlet,{read, n, rate, urls[]}>}`; `async buildProposals({ round, items, answers, scores, interests, sources, sections, generate, detect }) → Proposal[]` where `Proposal = {kind: 'summary'|'interest_add'|'interest_change'|'interest_drop'|'source_add'|'section_add', payload, evidence: {headlines: string[], numbers: object}}`.

- [ ] **Step 1:** Score tests: skip ignored; maybe = 0.5; state boundaries at exactly 4, 6, 0.2, 0.8.
- [ ] **Step 2:** Proposal tests (stubbed model and detect): outlet with 3 reads at rate ≥ overall → `source_add` with own RSS when `detect` finds one, else `https://news.google.com/rss/search?q=site:<domain>+when:1d&hl=en-AU&gl=AU&ceid=AU:en`; followed outlet never proposed; 2 reads → none; area with 9 of 11 read (score ≥ 0.7, n ≥ 8) and 2 outlets → `section_add` whose `evidence.numbers` is `{read: 9, n: 11, overallRead: 4, overallN: 10}` and whose reason text is exactly built from those numbers; model interest proposal with a term absent from its supporting headlines is dropped; invalid interest (fails `normaliseInterests`) dropped; summary sentences that contradict the numbers (claims a like for a score < 0.5) dropped.
- [ ] **Step 3:** FAIL. **Step 4:** Implement. Section reason copy: `You said you'd read ${read} of ${n} ${title} headlines, against ${overallRead} in ${overallN} across the whole round. ${outlets joined "A, B and C"} would fill it.` **Step 5:** Pass + full suite.

### Task 8: Custom sections

**Files:**
- Modify: `src/pipeline/writer/sections.js` (add `allSections(customSections) → Section[]`, `customSectionsFrom(settings)`), `src/settings.js` (`custom_sections` setting: `[{id, title, areas[]}]`, ids prefixed `c-`; `normaliseSections` accepts their ids), `src/pipeline/writer/prompts.js`, `src/pipeline/writer/validate.js`, `src/pipeline/assembler.js`, `src/learning.js`, Settings section list in `public/app.js`
- Test: `test/custom-sections.test.js`

**Interfaces:**
- Produces: every place that read `SECTIONS` reads `allSections(...)` instead; `SECTIONS` stays the built-in list. Sources gain an optional `section` override (existing `category` column if it serves, else additive column) used by section mapping before the category table.

- [ ] **Step 1:** Tests: a custom section appears in the writer's allowed section ids, assembler output and Settings order; a story mapped to a removed custom section lands in `internet` (Review Focus 5); an old edition with a custom section renders with its stored title; built-in behaviour unchanged (existing section tests still pass).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** Pass + full suite.

### Task 9: Results page and applying decisions

**Files:**
- Create: `src/quiz/apply.js`
- Modify: `src/routes/quiz.js`, `public/app.js`, `public/style.css`, `public/quiz-logic.js`
- Test: `test/quiz-apply.test.js`, additions to `test/quiz-logic.test.js`

**Interfaces:**
- Consumes: Tasks 3, 7, 8; settings set path used by `src/routes/settings.js`; source insert used by `src/routes/sources.js`.
- Produces: `applyProposal(db, settings, proposal, decision) → {status: 'applied'|'declined'|'already'|'noop', message}`.

- [ ] **Step 1:** Apply tests (Review Focus 4): add interest with an existing label merges terms and sets weight; change weight; drop; add source whose URL exists → `already` "Already in your paper"; add section creates `custom_sections` entry and maps its accepted sources; second decision → `noop`; decline changes nothing.
- [ ] **Step 2:** FAIL. **Step 3:** Implement apply, then the results view at `/tune/results/:roundId`: four parts in the spec's order (what you like and skip; changes to your interests; places the paper is missing; new sections), each proposal with its evidence headlines and Yes / No; numbers behind a summary sentence shown on tap.
- [ ] **Step 4:** Pass + full suite.

### Task 10: Settings entry and dev check

**Files:**
- Modify: `public/app.js` (Settings: "Tune your paper" row with last-round date), `public/style.css`

- [ ] **Step 1:** Add the entry; link to `/tune`, or to the open round, or to the last results.
- [ ] **Step 2:** Full suite passes.
- [ ] **Step 3 (Claude):** Build dev, run a real round end to end, drive it at three widths, check proposals against the answers given, clear test answers, then write Jesse's check list.

---

## Trial results

(Filled in by Claude after Task 1 Step 6 and Task 2 Step 6.)
