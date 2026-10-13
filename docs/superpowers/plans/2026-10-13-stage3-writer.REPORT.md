# Stage 3 — The writer — Implementation Report

## Task 1 — Sections and interest list

Status: complete.

Changed:

- Added `src/pipeline/writer/sections.js` with the ordered seven sections, top section, section-id validation and data-driven fallback mappings.
- Added `src/pipeline/writer/interests.js` with all 25 seeded interests, Unicode-aware whole-word matching and score summing.
- Added all writer, model, context, article-length and section-size settings to `src/settings.js`.
- Masked `anthropic_api_key` in both settings GET routes while leaving PUT storage unchanged.
- Added `test/writer-sections.test.js`, `test/interests.test.js`, and expanded `test/settings.test.js`, including route-level masking checks.

Red evidence: the focused run failed all 3 test files with `MODULE_NOT_FOUND` for the new sections/interests modules. After implementation the original Task 1 focused run passed 7/7; the later masking audit also passed.

## Task 2 — Interest list in rank

Status: complete.

Changed:

- Added interest matching to every cluster's combined item titles/descriptions.
- Added 13 rank points per interest weight. A weight-3 local match is 39 points, approximately the 39.6-point coverage advantage of three outlets over one.
- Preserved keyword boosts and penalties.
- Passed configured interests from the pipeline and carried `interest_matches`, `coverage`, and rank into `toItem` candidates.
- Expanded `test/rank.test.js` and `test/toItem.test.js`.

Red evidence: the focused run had 3 failures out of 6: `INTEREST_POINTS` was undefined, interest score was absent, and `toItem` omitted the new fields. The implemented focused run passed 6/6.

## Task 3 — Prompts, schemas and validation

Status: complete.

Changed:

- Added closed write/edit JSON schemas and fixed Australian-English system prompts in `src/pipeline/writer/prompts.js`.
- Added per-story prompt construction with distinct outlets, coverage, interest labels, teasers, capped article text and at most five community comments.
- Added safe write parsing, trimming, data-driven publisher fallback, editor repair, deterministic ordering, top clamping, section filling and lossless `more` output in `src/pipeline/writer/validate.js`.
- Added `test/writer-prompts.test.js` and `test/writer-validate.test.js`.

Red evidence: both focused test files failed with `MODULE_NOT_FOUND` for the prompt and validation modules. The initial implemented focused run passed 11/11; the final audit added and passed the explicit 12-top-pick case.

Interpretation: to satisfy both the plan's safe-shortening rule and Review Focus 2, a 161–399-word detail is cut at the last safe sentence before the limit, while a 400-word-or-longer detail is treated as junk and uses the publisher fallback even when it contains sentence stops.

## Task 4 — Ollama backend

Status: complete.

Changed:

- Added `src/pipeline/writer/ollama.js` with structured `/api/chat` requests, schema-valued `format`, explicit `num_ctx`, write/edit token limits, 300-second abort timeout, usage/duration extraction and bounded HTTP errors.
- Added `test/writer-ollama.test.js` with injected fetch responses and exact request-body assertions.

Red evidence: the focused test file failed with `MODULE_NOT_FOUND` for the backend. The implemented focused run passed 3/3.

## Task 5 — Anthropic backend and fallback

Status: complete.

Changed:

- Added the exact Anthropic structured-output call shape in `src/pipeline/writer/anthropic.js`, including ephemeral system caching, model-specific token limits and low effort only for supported Sonnet/Opus models.
- Added `WriterOutputError` for refusals, token exhaustion, missing text and invalid JSON.
- Added the requested model capability/price table and token-cost calculation in `src/pipeline/writer/prices.js`.
- Added `src/pipeline/writer/index.js` with SDK-class-based failure classification, one-time WARN, run-long backend switching, story-only Ollama retry for bad requests/output failures, backend attribution, usage totals and serialised Ollama fallback calls.
- Added `test/writer-anthropic.test.js` and `test/writer-fallback.test.js`.

Red evidence: both focused test files failed with `MODULE_NOT_FOUND` for the Anthropic and writer-index modules. The implemented focused run passed 8/8.

Review coverage includes connection failure, generic 5xx, 429, 401, missing key, story-level 400, mid-run switching, one warning and both writer identities.

## Task 6 — Write and edit steps

Status: complete.

Changed:

- Added `src/pipeline/writer/write.js` with rank-stable IDs, backend-controlled concurrency, validation fallback, actual `written_by`, not-news dropping/logging, progress/cancellation and full token/cost/time stats.
- Added `src/pipeline/writer/edit.js` with editor prompting, repair validation, deterministic exception fallback, stats and completion logging.
- Added `test/writer-write.test.js` and `test/writer-edit.test.js`.

Red evidence: both focused test files failed with `MODULE_NOT_FOUND` for the new orchestration modules. The implemented focused run passed 4/4.

Review coverage includes invalid/duplicate editor IDs, undersized top filling, oversized top clamping, total editor failure, and a valid `is_news: false` story being dropped, logged and counted.

## Task 7 — Assemble and wire the pipeline

Status: complete.

Changed:

- Replaced categorise/summarise execution with write/edit in `src/pipeline/index.js`.
- Added candidate-array persistence after extraction, injected candidate directory support and newest-seven retention.
- Rewrote `src/pipeline/assembler.js` for top-first ordered sections, no top duplication, full story fields, `more`, writer identity and nested write/edit stats.
- The pipeline now stores the complete briefing object and reports written/not-news totals.
- Updated `src/pipeline/toItem.js`, added `test/assembler.test.js`, and expanded `test/pipeline-order.test.js` and `test/toItem.test.js`.
- Updated `src/db.js` so stored briefing `item_count` includes each section's `more` array.

Red evidence: the focused run failed 6/6: the old assembler rejected the new input, DB counted 2 instead of 4, the old stage order remained, `saveCandidates` was absent, and candidate rank was absent. The implemented focused run passed 6/6.

Deviation: `src/db.js` was not named in Task 7's file header, but the same task explicitly requires item count to include top, section and `more` items. The minimal counting change was necessary to meet that requirement and is covered by a temporary-DB test.

Current reader compatibility: `public/app.js` renders `title`, `summary`, `detail`, `significance`, `image`, `sources`, and `reading_time`. It currently ignores `kicker`, section `more`, reader article URLs/HTML, coverage, interest labels and writer attribution; those fields remain stored for Stage 4.

## Task 8 — Status page stage list

Status: complete.

Changed:

- Replaced Categorise/Summarise with Write/Edit in the status-page stage list, descriptions, completion patterns and logger components in `public/app.js`.
- Added complete stage-metadata assertions to `test/pipeline-order.test.js`.

Red evidence: the focused run passed 2 existing checks and failed the new metadata check because the page still listed Categorise/Summarise. The implemented focused run passed 3/3.

## Task 9 — Compare script

Status: complete.

Changed:

- Added `scripts/compare-writers.js` with repeated Ollama/Anthropic writer specs, optional limit/output/DB arguments, DB and environment API-key lookup, direct backends without fallback, shared candidate execution, and measured edition/monthly costs.
- Added a self-contained responsive light/dark HTML comparison showing metrics, side-by-side top picks, every original story and explicit not-news/failure cells. All dynamic text is escaped.
- Added `test/compare-writers.test.js` for exact escaping and parsed whole-document output values.

Red evidence: the focused test file failed with `MODULE_NOT_FOUND` for the script. The implemented focused run passed 2/2.

## Deviations and exclusions

- No dependency installation was run because `@anthropic-ai/sdk` was already installed and present in both package files, as directed.
- The legacy `src/ollama.js`, `categoriser.js`, and `summariser.js` remain in the tree. The new pipeline no longer calls the latter two; removal is deferred by the plan.
- Task 10 was not run: it is explicitly assigned to Claude and would require the data directory, containers and real services, all excluded by this Codex task's safety constraints.

## Final verification

`npm test` summary:

```text
ℹ tests 111
ℹ suites 16
ℹ pass 111
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

## Paid backend removal

2026-10-13: Anthropic backend removed after build — owner declined paid API usage.

Changed:

- Removed the paid writer backend, its fallback wrapper, pricing module and their tests.
- Kept the Ollama writer interface, publisher fallback behaviour, token counts and timings.
- Removed paid-backend settings and key masking, then simplified the comparison script to accept only repeated `--writer ollama:<model>` flags without cost figures.
- Removed the SDK and its exclusive transitive packages from the package manifest and lockfile.
