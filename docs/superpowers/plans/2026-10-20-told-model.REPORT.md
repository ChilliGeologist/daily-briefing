# Told model pipeline change report

Date: 2026-10-20  
Approval: Jesse, 2026-10-20, after the 30-story comparison described in the task

## What changed

- Added `getToldOllamaModel()`. `told_ollama_model` falls back to `writer_ollama_model`, which in turn retains its existing fallback to `ollama_model`.
- Added `getToldNumThread()`. `told_num_thread` defaults to `4` and stored values are converted to numbers like the other numeric settings.
- Added a dedicated told Ollama writer. Told chat requests use the told model, `keep_alive: "5m"`, and `options.num_thread` from settings while retaining the existing context, temperature and output-token settings.
- Kept story writing before told inference and documented the ordering in the pipeline. The told model is unloaded with `POST /api/generate` and `{ model, keep_alive: 0 }` after the told step when its model differs from the main writer model. Unload failures produce a warning and do not fail the briefing.
- A failed told-model call now logs a warning and retries that story once through the main writer model. If that also fails, the story receives its deterministic outlets-only result and another warning. An outer pipeline guard also prevents an unexpected told-step exception from failing the briefing.
- `buildTold` now accepts a `plain` stance with an empty, missing or non-string quote and stores `quote: ""`. A `toward` or `against` stance still needs a non-empty, no-more-than-12-word verbatim quote and passes through all existing own-words, attribution and plain-allegation validation.
- The told prompt now asks for evidence quotes only for `toward` and `against`. The schema makes `quote` optional and describes empty/omitted quotes for `plain`.
- No `public/` files were edited by this work. The server settings routes have no setting-key allow-list or explicit writer-model list; they already accept and return stored setting keys.

## Failing-first evidence

The new focused tests were added before production code and run with:

```text
node --test test/settings.test.js test/writer-told-own-words.test.js test/writer-told-model.test.js
```

Initial result:

```text
tests 21
suites 1
pass 14
fail 7
cancelled 0
skipped 0
todo 0
```

The failures demonstrated:

- `getToldOllamaModel is not a function` in the default, stored-value and fallback-chain settings cases.
- `createToldWriter is not a function` in the request-options and fake-fetch model-fallback cases.
- No two-stage warning/fallback path when both models failed.
- The Trump/Zelenskyy subject was dropped because the AP, Reuters and The Australian `plain` stances had empty or missing quotes.

After implementation, the focused/adjacent run passed all 45 tests:

```text
node --test test/settings.test.js test/writer-told-own-words.test.js test/writer-told-model.test.js test/writer-ollama.test.js test/edition-review-job1.test.js
tests 45
suites 8
pass 45
fail 0
```

## Regression coverage

- Trump/Zelenskyy: SBS is `against` Trump with `escalated a battle with Zelenskyy`; AP and The Australian have empty `plain` quotes; Reuters omits its `plain` quote. The subject survives with four valid stances and `differs: true`.
- Empty/missing evidence on `toward` and `against` remains invalid.
- Told-model fallback is tested through a fake Ollama fetch: a 404 for `told-model` is followed by exactly one successful request for `writer-model`.
- A double model failure is tested to produce outlets-only data and warnings, without throwing.
- Told request bodies are checked for `keep_alive: "5m"` and `options.num_thread: 4`.
- The unload request is checked for the told model and `keep_alive: 0`.
- The settings tests cover explicit told values and both fallback links.

## Final verification

The full current worktree suite passed:

```text
npm test
tests 322
suites 35
pass 322
fail 0
cancelled 0
skipped 0
todo 0
```

Targeted `git diff --check` for the files changed by this work also passed.
