# Pipeline source fixes report — 2026-10-20

Jesse approved these pipeline changes on 2026-10-20. Implementation changes are confined to `src/` and `test/`; this report is the requested documentation artifact. No containers, databases, services, dependencies, or git history were changed.

## What changed

### 1. Writer processor cap

- Added `settings.getWriterNumThread()`, backed by `writer_num_thread`, with a default of `4`.
- `createWriter()` passes that setting to the Ollama writer, so writing, editing, vision, and writer-model told fallback requests all include `options.num_thread`.
- The separate told writer continues to use `told_num_thread`, default `4`.
- The told method accepts an optional per-call prediction limit. Ordinary told calls remain at `1200`; stance verifications use `80`.
- Tests assert the complete `options` value for write, edit, vision, writer-told, and told-model request bodies.

The pre-existing defaults already resolve both `writer_ollama_model` and `told_ollama_model` to `gemma4:26b` when unset; the tests now cover those defaults together with both processor caps.

### 2. Second check for “how it was told”

- The first told prompt now explicitly permits only a person, political party, organisation, government, or arguable cause as a subject, and explicitly excludes events, accidents, disasters, animals, objects, and crowds.
- After deterministic `buildTold()` validation, each surviving non-plain stance gets exactly one short, structured verification call.
- A stance survives only when `a=yes`, `b=yes`, and `c` exactly matches its original `toward` or `against` value.
- `a=no` removes the entire subject. Any other invalid/mismatched answer, including a failed call, changes that stance to `{ stance: "plain", quote: "" }`.
- `differs` is recomputed from the verified stances. A valid subject may remain with all-plain stances and `differs: false`; a subject rejected by question (a) is omitted.
- If the main told model is unavailable and the existing writer-model fallback produces the initial told result, that same fallback performs its short verification calls.
- Tests use fake model responses for all required examples:
  - plain: Al Jazeera’s “No Kings network opposed to United States President Donald Trump”;
  - dropped subject: “The fire incident” / “devastating fire rips through”;
  - dropped subject: racehorse “Ohope Wins” / “tragic fall”;
  - plain: “put pressure on governments across the European Union”;
  - retained: SBS “escalated a battle with Zelenskyy” against Donald Trump;
  - retained: 7NEWS “Killers given whopping sentences”.
- Additional tests cover verification failure, direction mismatch, exact one-call-per-non-plain-stance behaviour, the closed schema, the exact prompt, and the `80` prediction cap.

### 3. Reddit self-post help requests

- Reddit self-post titles beginning `How to `, `How do you `, or `How can I ` are deterministic help requests.
- The existing `external_url` exemption still runs first, so shared articles with those title forms remain eligible.
- The supplied r/selfhosted wildcard-certificate title is covered as a whole value.

### 4. Live pages

- `preWriteDropReason()` now returns `live blog` for titles beginning `Live:` or `LIVE:` before the page reaches the writer.
- Tests cover both cases, the supplied former A-G example, and a neighbouring non-live title.

### 5. Kicker place and region casing

- Sentence-case repair now restores canonical casing after its existing evidence-based casing pass.
- The protected names include the approved compass-region list and the existing Tasmanian, Australian, and foreign place data, including multi-word names and aliases.
- A single precompiled matcher keeps this deterministic and avoids repeatedly scanning every place name.
- Tests cover `Middle East`, `East Africa`, `Asia-Pacific`, Tasmanian `Port Sorell`, and foreign `New Delhi`, while the existing mid-sentence proper-name and acronym tests remain green.

## Exact verification prompt

System prompt:

```text
Verify one proposed outlet stance. Answer each field exactly as requested.
```

User prompt template (`<headline>` and `<opening>` are the same quote-stripped outlet words shown to the first told call):

```text
Outlet: <outlet>. Its own words: <headline>
<opening>. Phrase: "<quote>". Subject: <subject>.
a) Is <subject> a person, political party, organisation, government, or a cause people argue for or against? Not an event, accident, disaster, animal, object or crowd. (yes/no)
b) In this phrase is the outlet itself expressing a view about <subject>, through its own word choice, rather than describing someone else's position or plainly reporting what happened? (yes/no)
c) If yes, which way: toward or against?
```

If the opening already ends in `.`, `!`, or `?`, the implementation does not add a second full stop before `Phrase:`. If the opening is empty, the headline alone is used as the outlet’s own words.

Structured response:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["a", "b", "c"],
  "properties": {
    "a": { "type": "string", "enum": ["yes", "no"] },
    "b": { "type": "string", "enum": ["yes", "no"] },
    "c": { "type": "string", "enum": ["toward", "against"] }
  }
}
```

`num_predict` is `80`.

## Failing-first evidence

The new regression file was run before implementation:

```text
$ node --test test/second-check.test.js
tests 10
suites 3
pass 1
fail 9
duration_ms 575.168319
```

The failures demonstrated each requested gap:

- `getWriterNumThread is not a function`, and write/edit/vision/writer-told bodies lacked `num_thread`;
- the first told prompt lacked the complete subject exclusions;
- Al Jazeera, fire, racehorse, EU-government reporting, and failed-verification cases retained their original non-plain stances;
- `How to ...` and `How do you ...` self posts returned `false`;
- both `Live:` and `LIVE:` pages returned no drop reason;
- kickers were returned as `Middle east politics`, `East africa trade`, and lower-cased known place names.

The one passing test at that red stage was the survivor fixture: without a second call, the old code happened to leave the SBS/7NEWS initial stances unchanged. The later exact call-count and verification-answer assertions ensure those stances now survive because the second check approves them, not because no second check ran.

## Passing verification

Focused completed regression run:

```text
$ node --test test/second-check.test.js
tests 11
suites 3
pass 11
fail 0
duration_ms 345.942715
```

Final full-suite run:

```text
$ npm test
tests 335
suites 38
pass 335
fail 0
duration_ms 2769.207055
```
