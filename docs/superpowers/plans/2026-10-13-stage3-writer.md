# Stage 3 — The writer — Implementation Plan

> **For agentic workers:** this plan is executed by Codex, dispatched from
> Claude Code. Steps use checkbox (`- [ ]`) syntax for tracking. Codex cannot
> commit (its sandbox holds `.git` read-only); Claude commits after the run.

**Goal:** Replace "categorise, then summarise" with **write → edit**. The
writer turns each ranked story (cluster plus full article text) into a
headline, a one-sentence summary, a 60–120 word detail paragraph, a one- or
two-word kicker and one of seven sections, and says whether it is news at
all. The editor makes one call over the whole day and picks "You should
know" (5–7 stories) and the best 4–5 per section in order. Two writer
backends — local Ollama and the Anthropic API — behind one interface, with
fallback from Anthropic to Ollama, and a script that runs several writers
over the same saved morning and produces a side-by-side HTML page with token
counts and cost.

**Architecture:** New modules under `src/pipeline/writer/`:
`sections.js` (the seven), `interests.js` (interest list + matching),
`prompts.js` (prompt text and JSON schemas, pure), `validate.js` (output
checking, pure), `ollama.js` and `anthropic.js` (backends),
`index.js` (`createWriter(settings, log)` returning the chosen backend
wrapped with fallback), `write.js` (per-story loop), `edit.js` (editor call
plus deterministic fallback). `assembler.js` is rewritten to build the new
briefing shape. `categoriser.js` and `summariser.js` are no longer called by
the pipeline but stay in the tree (stage 8 removes them).

**Tech Stack:** Node 22, CommonJS, `node:test`, better-sqlite3, Ollama HTTP
API, `@anthropic-ai/sdk` (the one new dependency).

**Spec:** `docs/superpowers/specs/2026-10-13-overhaul-design.md`, sections
"Pipeline, new order" steps 7–9, "Writers", "Interest list".

## Global Constraints

- CommonJS, matching existing files. Only new dependency: `@anthropic-ai/sdk`
  (add to `package.json` and `package-lock.json` with `npm install`).
- Tests: `npm test`. Every new test must fail against the code before the
  task's change; show that failure. Assert whole values (exact objects,
  arrays, strings, numbers), never substrings.
- Tests never touch the network: inject `fetchImpl` for Ollama and a fake
  `client` (object with `messages.create`) for Anthropic.
- No per-site or per-product `if` branches in generic code. Seeded lists
  (sections, interests, prices) are data.
- Do not change the database schema, source rows, the categories table, or
  anything under `public/` except the Status-page stage list (Task 8).
  The briefing is still stored through `db.insertBriefing(date, {headline,
  sections, ...})` as a JSON blob; the new fields ride inside it.
- The Anthropic API key is a setting (`anthropic_api_key`), never in the repo,
  never logged, and never returned by the settings API: `GET /api/settings`
  and `GET /api/settings/anthropic_api_key` return it masked as
  `"••••" + last 4 characters` (or `null` when unset). `PUT` stores it as sent.
- Australian English in all prompt text and seeded labels.
- Writing quality rules (put in the prompts verbatim, Task 3): keep the
  publisher's headline unless it is vague, clickbait or misleading, and never
  make it vaguer; no padding, no "In a significant development", no
  rhetorical questions; the kicker is one or two plain words naming the
  topic ("Plex", "State politics", "Basketball"), never a sentence and never a
  reason the story was picked.

## Review Focus

1. **Anthropic fails mid-run** (network error, 5xx, 429 after the SDK's own
   retries, 401 bad key) — the rest of the run uses Ollama, the switch is
   logged once at WARN with the reason, the run completes, and the briefing
   records which writer wrote each story. Test in Task 5.
2. **A writer returns junk** (unparseable JSON, unknown section, empty
   headline, 400-word detail) — that story falls back to the publisher's
   headline and teaser, section from the interest/source default, never
   throws. Test in Task 3.
3. **The editor returns ids that don't exist, duplicates, or 2 or 12 top
   picks** — invalid ids dropped, duplicates removed, the top list clamped to
   5–7 by filling from the deterministic order. If the editor call fails
   outright, the deterministic order is used entirely. Test in Task 6.
4. **Ollama silently truncates long prompts** — Ollama's default context is
   small; every Ollama writer call passes `options.num_ctx` (setting,
   default 8192) and the article text is capped (setting, default 6000
   characters) so prompt + article fits. Test that the request body carries
   both. Task 4.
5. **A story the writer marks not-news** (a quiz, an ad, a listicle) — dropped
   from the briefing, logged at INFO with its title, counted in stats. It
   must never empty a section the floor guaranteed: if dropping it leaves a
   section with nothing, that's fine — the section is simply absent. Task 7.

---

### Task 1: Sections and interest list

**Files:** create `src/pipeline/writer/sections.js`,
`src/pipeline/writer/interests.js`; modify `src/settings.js`; tests
`test/writer-sections.test.js`, `test/interests.test.js`,
`test/settings.test.js`.

- `SECTIONS` — ordered array of `{ id, title }`:
  `tasmania` "Tasmania", `australia` "Australia", `world` "World",
  `tech` "Tech & Security", `homelab` "Homelab & Self-hosting",
  `gaming` "Gaming", `internet` "Around the internet".
  `TOP_SECTION = { id: 'top', title: 'You should know' }`.
  `isSectionId(id) → boolean`.
- Interest entries: `{ label, kind: 'place'|'topic'|'product', terms: string[],
  weight: number, urgent: boolean }`. Seed (`DEFAULT_INTERESTS`, Australian
  spelling, weights 1–3, local places highest):
  - places: West Tamar (terms: West Tamar, Beaconsfield, Beauty Point,
    Exeter, Legana, Riverside, Grindelwald, Tamar Valley; weight 3),
    Launceston (Launceston, City of Launceston; 3), Northern Tasmania
    (northern Tasmania, north Tasmania, Devonport, George Town, Meander
    Valley, Deloraine; 2), Tasmania (Tasmania, Tasmanian, Hobart; 1).
  - topics: Council politics (council, mayor, councillor; 2), State politics
    (Tasmanian parliament, House of Assembly, Tasmanian government, premier, state budget; 2), Federal
    politics (federal parliament, prime minister, Senate, federal budget, federal election; 1),
    Emergencies (bushfire, fire warning, flood, severe weather, evacuate,
    emergency warning, road closed, road closure; 3, urgent), Events
    (festival, show, market, concert, AFL, NBL, JackJumpers, Tassie Devils; 1).
  - products: Unraid, Plex, Sonarr, Radarr, Home Assistant, UniFi
    (UniFi, Ubiquiti), Tailscale, Authelia, Proton (Proton, Proton Drive,
    Proton Mail), Up Bank (Up Bank, Up banking), Aurora Energy (Aurora
    Energy, electricity price, solar feed-in), interest rates (RBA, cash rate,
    interest rate), Woolworths, Coles, Dota 2 (Dota 2, Dota), Old School
    RuneScape (Old School RuneScape, OSRS). Weight 2. `urgent: true` on the
    server/network products (Unraid, Plex, Sonarr, Radarr, Home Assistant,
    UniFi, Tailscale, Authelia, Proton) — urgency is only stored now;
    alerts are stage 6.
- `matchInterests(text, interests) → [{ label, kind, weight, urgent, term }]`:
  case-insensitive whole-word/phrase match (word boundaries, so "Coles"
  does not match "Nicoles", "Dota" does not match "anecdotal"), one entry per
  interest (first matching term), in the interests' order.
- `interestScore(matches) → number`: sum of weights.
- settings: `getInterests()` (default `DEFAULT_INTERESTS`),
  `getWriter()` (`'ollama'` default; `'anthropic'`),
  `getAnthropicApiKey()` (null default), `getAnthropicWriteModel()`
  (`'claude-haiku-4-5'`), `getAnthropicEditModel()` (`'claude-sonnet-5-5'`),
  `getWriterOllamaModel()` (falls back to `getOllamaModel()`),
  `getOllamaNumCtx()` (8192), `getWriterArticleChars()` (6000),
  `getSectionSize()` (5), `getTopSize()` ({min: 5, max: 7}).

### Task 2: Interest list in rank

**Files:** modify `src/pipeline/rank.js`, `src/pipeline/index.js` (pass
interests); test `test/rank.test.js`.

- `rankClusters(..., { interests })`: each cluster gets
  `interest_matches` = `matchInterests(lead title + lead description of every
  item, interests)` and its score gains `interestScore × INTEREST_POINTS`
  (constant, choose so one weight-3 local match lifts a single-outlet story
  roughly level with a three-outlet national story; state the reasoning in a
  comment). Existing boost/penalty keywords keep working.
- `toItem` carries `interest_matches` and `coverage` through.

### Task 3: Prompts, schemas and validation (pure)

**Files:** create `src/pipeline/writer/prompts.js`,
`src/pipeline/writer/validate.js`; tests `test/writer-prompts.test.js`,
`test/writer-validate.test.js`.

- `WRITE_SCHEMA` (JSON Schema, `additionalProperties: false`, all required):
  `is_news` boolean, `headline` string, `summary` string, `detail` string,
  `kicker` string, `section` enum of the seven ids.
- `writeSystemPrompt()` → fixed string (no dates, no per-story data, so it
  can be cached): the job, the reader (lives in West Tamar near Launceston,
  Tasmania; reads on a phone at breakfast), the seven sections with one line
  each on what goes where (Tasmania includes what's on; Around the internet
  is Reddit/HN culture and oddities), the quality rules from Global
  Constraints, the lengths (summary one sentence ≤ 30 words; detail 60–120
  words synthesising all sources, noting where they disagree), `is_news`
  false for quizzes, puzzles, ads, sponsored content, listicles, live-blog
  shells and pages with no story.
- `writeUserPrompt(item, { articleChars })` → the per-story part: original
  headline, outlets (distinct names), coverage count, interest matches as
  plain labels, teaser(s), article text capped at `articleChars`, up to 5
  community comments for Reddit/HN items.
- `EDIT_SCHEMA`: `top` array of story ids (strings), `sections` object with
  one key per section id → ordered array of story ids.
- `editSystemPrompt()` fixed string: pick 5–7 "You should know" stories —
  biggest coverage first, then interest matches with real consequence for
  the reader (an emergency near home, a security hole in something he runs,
  a price change he pays); a story in "You should know" is not repeated in
  its section; order each section best first, at most N.
- `editUserPrompt(stories, { sectionSize })` — one line per story: id,
  section, coverage, interest labels, kicker, headline, summary.
- `validateWrite(raw, item) → { ok, value, problems[] }`: parse (string or
  object); require non-empty headline/summary/detail/kicker; section must be
  a section id; trim whitespace; kicker > 3 words or > 24 chars is a
  problem; detail over 160 words is cut at the last sentence end before 160
  words and noted; on failure `value` is the fallback
  `{ is_news: true, headline: item.title, summary: first sentence of the
  teaser (≤ 200 chars), detail: teaser, kicker: first interest label or the
  outlet name, section: defaultSection(item) }`, `ok: false`.
  `defaultSection(item)`: from interest matches (place → tasmania, products
  in the server list → homelab, games → gaming) else `australia`. Keep that
  mapping as data in `sections.js`, not branches.
- `validateEdit(raw, stories, { sectionSize, topSize }) → { top, sections,
  problems[] }` per Review Focus 3, with `deterministicEdit(stories, opts)`
  as the filler/fallback: top = sort by coverage desc, then interest score
  desc, then rank asc, take `topSize.min`... but only stories with coverage
  ≥ 2 or an interest match qualify, then fill to min from the rest;
  sections = each section's remaining stories by rank, first `sectionSize`.
  Every story not placed in top or the first N of its section is returned in
  `more[sectionId]` in rank order — nothing written is thrown away.

### Task 4: Ollama backend

**Files:** create `src/pipeline/writer/ollama.js`; test
`test/writer-ollama.test.js`.

- `createOllamaWriter({ url, model, numCtx, fetchImpl, log })` →
  `{ name: 'ollama:<model>', write(system, user, schema),
  edit(system, user, schema) }`. Each call is `POST <url>/api/chat` with
  `messages: [system, user]`, `format: schema`, `stream: false`,
  `think: false`, `keep_alive: '30m'`, `options: { temperature: 0.3,
  num_ctx, num_predict: 700 }` (edit: `num_predict: 1500`), 300 s timeout.
  Returns `{ json, usage: { input_tokens: prompt_eval_count, output_tokens:
  eval_count }, duration_ms }`. Non-2xx throws with status and first 200
  chars of body.

### Task 5: Anthropic backend and fallback

**Files:** create `src/pipeline/writer/anthropic.js`,
`src/pipeline/writer/index.js`, `src/pipeline/writer/prices.js`; tests
`test/writer-anthropic.test.js`, `test/writer-fallback.test.js`.

- `createAnthropicWriter({ apiKey, writeModel, editModel, client, log })`:
  `client` defaults to `new Anthropic({ apiKey, maxRetries: 2, timeout:
  120000 })` from `@anthropic-ai/sdk`. Call shape (exactly this):

  ```js
  client.messages.create({
    model,
    max_tokens: 2000,          // edit: 4000
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema } },
  })
  ```

  For the edit call on a Sonnet/Opus model also pass
  `output_config.effort: 'low'` (leave `thinking` unset; do not send
  `thinking: {type:'disabled'}` — it is a 400 on current Sonnet). Do not send
  `effort` to Haiku models (400). Decide by a data table in `prices.js`
  (`supportsEffort`), not by string sniffing scattered through the code.
  Check `stop_reason`: `refusal` or `max_tokens` → throw a `WriterOutputError`
  (story-level failure, not a backend failure). Parse the first text block
  as JSON. Return `{ json, usage: { input_tokens, output_tokens,
  cache_read_input_tokens, cache_creation_input_tokens }, duration_ms }`.
- `prices.js`: per-million-token USD prices — `claude-haiku-4-5` in 1 /
  out 5; `claude-sonnet-5-5` in 2 / out 10; `claude-opus-5-5` in 4 / out 20;
  cache reads 0.1× input, cache writes 1.25× input. `costUsd(model, usage)`;
  Ollama models cost 0.
- `createWriter(settings, log, deps)` in `index.js`: returns the configured
  backend; for `anthropic` it wraps it so that a **backend** failure
  (`Anthropic.APIConnectionError`, `APIConnectionTimeoutError`,
  `AuthenticationError`, `PermissionDeniedError`, `RateLimitError`,
  `InternalServerError`, any `APIError` with status ≥ 500) switches every
  later call in the run to Ollama and logs one WARN `Anthropic unavailable
  (<class>: <message>), using Ollama for the rest of this run`. A missing
  key with `writer = anthropic` uses Ollama from the start with the same
  WARN. `BadRequestError` and `WriterOutputError` are story-level: that story
  is retried once on Ollama, the backend is not switched. Use the SDK's
  exported error classes (`instanceof`), never message matching.
  The wrapper exposes `usedBackends()` (set of names that actually wrote)
  and `usage()` totals per model.

### Task 6: Write and edit steps

**Files:** create `src/pipeline/writer/write.js`,
`src/pipeline/writer/edit.js`; tests `test/writer-write.test.js`,
`test/writer-edit.test.js`.

- `writeStories(items, writer, settings, log, emitProgress, checkCancelled)`
  → `{ stories, dropped, stats }`. Sequential (one at a time — the GPU is
  the limit for Ollama; for Anthropic run up to 4 at once, controlled by a
  `concurrency` the backend exposes). Each story gets an `id` (`s1`, `s2`…
  in rank order), the validated fields, `written_by` (backend name),
  `write_ok`. `is_news: false` → into `dropped` with INFO log
  `Not news: "<title>"`. Stats: written, fallbacks, not_news, tokens in/out,
  cost_usd, duration_ms.
- `editStories(stories, writer, settings, log)` → `{ top, sections, more,
  stats }` using the edit prompt + `validateEdit`; any thrown error →
  `deterministicEdit`, WARN logged, `stats.edit_fallback = true`.

### Task 7: Assemble and wire the pipeline

**Files:** rewrite `src/pipeline/assembler.js`; modify
`src/pipeline/index.js`; tests `test/assembler.test.js`,
`test/pipeline-order.test.js`.

- Pipeline order becomes collect → filter → cluster → rank → extract →
  **write → edit** → assemble. Categorise and summarise are no longer called.
- After extract, save the candidate set (the `toItem` objects, including
  article text) to `data/candidates/<briefingDate>-<runId first 8>.json`;
  keep the newest 7 files, delete older ones. Directory path comes from an
  injected option defaulting to `path.join(__dirname, '../../data/candidates')`
  so tests use a temp dir.
- `assemble({ top, sections, more }, storiesById, meta)` →
  ```
  { headline,            // headline of top[0], else first story, else 'The Daily Gump'
    writer,              // e.g. 'anthropic:claude-haiku-4-5' or 'ollama:qwen3:8b' or both joined ' + '
    stats,               // write + edit stats
    sections: [          // 'top' first (if any), then the seven in SECTIONS order, empty ones omitted
      { id, title, icon: 'globe', items: [Story], more: [Story] } ] }
  ```
  Story = `{ id, title (the written headline), kicker, summary, detail,
  significance: 'high' for top items else 'medium' (the current screen reads
  it), image, sources, canonical_url, article_url, article_html,
  coverage, interest_labels, written_by, reading_time }`. A story in `top`
  appears only there. The current app screen must still render this
  (it reads `title/summary/detail/significance/image/sources/reading_time`
  and section `id/title/icon/items`); check `public/app.js` and say in the
  report anything it would drop.
- `db.insertBriefing` stores it; item count = top + section items + more.

### Task 8: Status page stage list

**Files:** modify `public/app.js` only where it lists stages and their
completion log patterns (`categorise`/`summarise` → `write` "Writing
stories" / `edit` "Choosing what matters"); log lines the patterns match:
`Wrote <n> stories` and `Edited: <n> top, <m> in sections`.

### Task 9: Compare script

**Files:** create `scripts/compare-writers.js`; test
`test/compare-writers.test.js` (HTML builder only, pure).

- `node scripts/compare-writers.js <candidates.json> --writer
  ollama:<model> --writer anthropic:<writeModel>[/<editModel>] [--limit N]
  [--out file.html]`. Reads settings (Ollama URL, API key) from the DB at
  `data/briefings.db` unless `--db` is given; the key can also come from the
  `ANTHROPIC_API_KEY` env var. Runs write + edit for each writer over the
  same candidates (no fallback in this mode — a failure is shown as a
  failure).
- Output: one self-contained HTML file (no external assets, inline CSS,
  readable on a phone, light and dark): a header per writer with stories
  written, failures, not-news drops, input/output tokens, measured cost for
  this edition and × 30 for a month (USD, two decimals), total time; then
  "You should know" side by side; then every story as a row with each
  writer's kicker/headline/summary/detail in columns and the original
  headline above them. Escape all text.
- `buildCompareHtml(results) → string` is the pure, tested part.

### Task 10: Run it for real (Claude, not Codex)

Claude runs the full test suite, builds `daily-briefing-dev`, runs the
pipeline once on dev with `writer = ollama`, then the compare script for
`ollama:qwen3:8b` vs `ollama:gemma4:latest`, and `anthropic` once the key
is set.

## Report

Write `docs/superpowers/plans/2026-10-13-stage3-writer.REPORT.md`: per task,
what changed, the failing-test evidence, anything in the plan you could not
do or did differently and why, and the final `npm test` summary line.
