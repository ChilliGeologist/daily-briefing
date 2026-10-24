# Edition review Job 1 report

## What changed

### Task 1 — drop stories with nothing behind them

- `src/pipeline/writer/write.js` adds the pre-write content gate: fewer than 40 article words without discussion/photo substance, single-outlet teasers below 150 words, and Guardian live blogs are dropped. Warning/release, real discussion and Reddit photo-post exemptions are explicit.
- `src/pipeline/writer/validate.js` rejects summaries that describe the page, subscription or lack of content; `write.js` retries once and drops a persistent failure.
- `src/pipeline/writer/prompts.js` reinforces the live-shell and no-story guidance.

### Task 2 — Reddit photo posts

- `src/pipeline/sources/reddit.js` reads full `i.redd.it`, `i.imgur.com` and `preview.redd.it` links, prefers the best-width form for the same image, and retains at most four images.
- `src/pipeline/writer/ollama.js` downloads the selected image, base64-encodes it and sends it in the user message's Ollama `images` field. `src/pipeline/writer/index.js` exposes the vision call.
- `src/pipeline/writer/prompts.js` and `src/pipeline/writer/write.js` add the photo-summary path and text-only failure fallback. Successful vision writes set `image_described: true`.
- `src/pipeline/toItem.js` and `src/pipeline/assembler.js` preserve `image`, `images` and `image_described` according to the shared story contract.
- Live format checks were made against r/homelab and r/selfhosted. The parser test retains a representative Atom photo/gallery fixture and asserts the complete parsed object.

### Task 3 — self-promotion and attention

- `src/pipeline/writer/validate.js` identifies Show HN and first-person project posts, applies the HN score / Reddit hot-position-plus-reply thresholds, widens help and suggestion matching, and deterministically rejects the reviewed tutorial/personal-essay examples.
- `src/pipeline/extractor.js` counts every real Reddit reply while retaining only the existing top-eight comment sample; `src/pipeline/toItem.js` carries `real_reply_count` to writing.
- `src/pipeline/writer/prompts.js` tells the writer that tutorials, personal essays, suggestions and feature requests are not news.
- `src/settings.js` adds entertainer births, pregnancies, engagements, weddings and divorces as filler revision 8, preserving user edits on existing installs.

### Task 4 — sections, lead and sport

- `src/pipeline/writer/sections.js` adds Sport after Gaming and before Around the internet.
- `src/pipeline/writer/prompts.js`, `src/pipeline/writer/validate.js` and `src/pipeline/writer/write.js` classify sport, force source-specific Tech/Internet routing, enforce the significance thresholds, and add lower-case headline, subjectless quote and unnamed-summary retries.
- `src/pipeline/writer/validate.js` makes the widest-coverage eligible story the lead; a place match alone cannot lead unless urgent or reporting a death.
- The saved final Bledisloe Cup Test is retained as the edition's qualifying Bledisloe decider and moved to Sport.

### Task 5 — warning, release and no-solo-top sources

- `src/pipeline/sources/rss.js` adds warning and release parsers, a browser-like warning-feed user agent, forced Tasmania/Homelab routing, prerelease filtering, and GitHub major/minor/security/breaking selection.
- `src/pipeline/sources/rss.js`, `src/pipeline/sources/reddit.js` and `src/pipeline/sources/api.js` propagate source-kind and `no_solo_top` flags.
- `src/pipeline/rank.js` injects the urgent Emergencies interest for warnings and removes heat-word bonuses from a lone `no_solo_top` source.
- `src/pipeline/writer/validate.js` excludes a lone `no_solo_top` story from the top section.
- The live BoM feed was checked with the required user agent. A live Home Assistant GitHub Atom feed check found the attached beta form `2026.10.0b1`; this is now rejected along with alpha/beta/rc/nightly/develop/preview/test forms.

### Task 6 — per-outlet source material

- `src/pipeline/extractor.js` associates successfully extracted text with the member it came from.
- `src/pipeline/toItem.js` emits an `outlet_versions` entry for every cluster member with the exact `{ name, headline, description, url, text }` shape, using that member's description when its article text was not extracted.

### Task 7 — how it was told

- New `src/pipeline/writer/told.js` selects two or more distinct non-Reddit outlets, supplies each outlet's headline, description and first 250 words in one extra bounded-concurrency model call, and requests at most three subjects.
- Validation accepts only the five subject kinds and three stances, enforces quotes of at most 12 words, validates each quote case- and quote-mark-insensitively against that same outlet, removes subjects with fewer than two valid stances, and derives `differs`. Failure or no surviving subject produces an outlets-only `told` object.
- `src/pipeline/index.js` runs this step after story writing; `src/pipeline/writer/index.js` and `ollama.js` expose/record the call; `src/pipeline/assembler.js` preserves `told` in briefing data.

Tests were added or updated in `test/edition-review-job1.test.js`, `test/settings.test.js`, `test/sources-reddit.test.js`, `test/toItem.test.js`, `test/writer-edit.test.js`, `test/writer-prompts.test.js`, `test/writer-sections.test.js`, `test/writer-validate.test.js` and `test/writer-write.test.js`.

## Tests

The focused suite has 7 suites and 21 tests, all passing. Each assertion compares complete values/objects/arrays rather than substring matches.

Failing-first evidence was captured before the corresponding implementation with:

`node --test --test-name-pattern='Job 1 task N' test/edition-review-job1.test.js`

| Task | Pre-change result | Representative failure |
|---|---:|---|
| 1 | 0 passed, 3 failed | `preWriteDropReason is not a function`; persistent page-meta output was retained |
| 2 | 0 passed, 3 failed | thumbnail object differed from the full-image object; `writer.vision is not a function` |
| 3 | 0 passed, 3 failed | project/essay helpers absent; filler revision was not 8 |
| 4 | 0 passed, 5 failed | Sport missing; sport/retry helpers absent; lead order differed |
| 5 | 0 passed, 3 failed | warning/release parsers absent; no-solo rank/top values differed |
| 6 | 0 passed, 1 failed | complete `outlet_versions` array absent |
| 7 | 0 passed, 2 failed | `src/pipeline/writer/told.js` did not exist |

Final verification:

- `node --test test/edition-review-job1.test.js`: **21 passed, 0 failed**.
- `npm test`: **282 passed, 0 failed**, 23 suites.
- `git diff --check -- . ':!public'`: clean.
- No real Ollama call was made; vision and told calls use fake clients in tests.

## Replay results

The throwaway replay script was kept outside the repository at `/tmp/job1-replay.js`. It loaded all 120 saved candidates, applied filler, pre-write, project, help/essay and sport decisions, and checked the written edition for retry, source-routing and lead fixes.

The plan file contains the totals but not the full grading table, so the 20/11 grouping below is reconstructed from the 104-story edition and the plan's concrete rule examples. The external Claude artifact was not fetched because the task limited network access to public feeds.

### Review junk (20)

| Rank | Story | Replay result |
|---:|---|---|
| 13 | Less can be more for Rugby League World Cup | Dropped — sport below significance threshold |
| 14 | The data that shows who won and lost in this year's AFL trade period | Dropped — sport below significance threshold |
| 16 | Schutt stars as Aussies sweep Bangladesh in ODI series | Dropped — sport below significance threshold |
| 27 | Australian politics live: Shoebridge denies knowing about Steele-John allegations… | Dropped — Guardian live blog |
| 37 | 'Gave it everything': the hard yards behind Ash's quest… | Dropped — sport below significance threshold |
| 39 | Wallaroos lose star but regain experience… | Dropped — sport below significance threshold |
| 42 | Australia is the monster that turns World Cup dreams to nightmares | Dropped — World Cup is not at a final stage |
| 55 | Aussie cyclists begin World Championships with silver medal | Dropped — sport below significance threshold |
| 60 | ParaMatildas hunt more Australian football history at World Cup | Dropped — World Cup is not at a final stage |
| 67 | TCL's contenders restock… ahead of 2026-27 opener | Dropped — sport below significance threshold |
| 68 | Things to know when you get cancer | Dropped — personal essay |
| 72 | Hilary Swank announces next ‘project’ in playful family video | Dropped — celebrity-family filler revision 8 |
| 74 | How to handle this network conundrum? | Dropped — community help request |
| 76 | The Double Headed Stack Allocator | Dropped — programming tutorial/essay |
| 77 | Out The Gate… The Everest… | Dropped — sport below significance threshold |
| 78 | Big Bang Theory star Kaley Cuoco gives birth to baby girl | Dropped — celebrity-family filler revision 8 |
| 83 | Tiny Little Office | Dropped — nothing behind the headline |
| 104 | Improve the fairy ring interface instead of adding a fourth wheel | Dropped — community suggestion |
| 118 | Character.ai Bankruptcy Is First AI Bubble Domino to Fall | Dropped — single-outlet teaser under 150 words |
| 119 | X’s reverse eternal September | Dropped — single-outlet teaser under 150 words |

### Review flaws (11)

| Rank | Story | Replay result |
|---:|---|---|
| 1 | Greens senator Jordon Steele-John takes leave… | Fixed — `s1`, coverage 6, becomes the widest-coverage eligible lead |
| 6 | “I just need better Wi-Fi,” I said. Anyway, here’s my rack. | Fixed on re-collection — full photo/`images[]`; vision when body is below 40 words |
| 18 | So I decided to make my own server rack | Fixed on re-collection — full photo/`images[]`; vision when body is below 40 words |
| 41 | “We'd end up in court” | Fixed — subjectless quote triggers a rewrite |
| 66 | the budget shift that 'halted' safety upgrades… | Fixed — lower-case opening triggers a rewrite |
| 71 | Upgrading from 16GB microserver to two Gen9 servers | Fixed on re-collection — full photo/`images[]`; vision when body is below 40 words |
| 73 | First Homelab purchase and a freebie! | Fixed on re-collection — full photo/`images[]`; vision when body is below 40 words |
| 86 | FBI raids DPRK IT worker laptop farms… | Fixed — World → Tech (Bleeping Computer) |
| 98 | Americans' social activity has steeply declined… | Fixed — World → Tech (Hacker News) |
| 100 | The states come for OpenAI | Fixed — “The legal action uses…” triggers a summary rewrite |
| 105 | Canada could save millions by developing its own operating system… | Fixed — World → Tech (`r/linux`) |

The final Bledisloe Cup Test (rank 11) is also fixed: it moves from Australia to Sport and survives as the qualifying Bledisloe decider.

### Additional drops from the 120 candidates

These are intentionally listed for over-reach review. “Already omitted” means the old writer had not included the candidate in the 104-story edition; the new rule now rejects it earlier and deterministically.

| Rank | Story | New result | Old edition |
|---:|---|---|---|
| 20 | Moving to Hobart to open a salad bar… advice | Help request | Already omitted |
| 23 | I'm about to do a masters in Protected Area Conservation in UTAS | Help/advice request | Already omitted |
| 28 | AFL stadium may spark Hobart hotel building boom | Nothing behind headline | Already omitted |
| 34 | Premier unveils new rules for Tasmania AI data centres | Nothing behind headline | Already omitted |
| 49 | An Apology | Single-outlet teaser | Already omitted |
| 59 | Housing slump costs Tasmanian budget $642m | Nothing behind headline | Already omitted |
| 75 | Self-host AWS: run EC2, S3, VPC and RDS… | Project without configured product interest or enough attention | Was present |
| 81 | A couple of question about the return of bond. | Help request | Already omitted |
| 96 | Show HN: Flipflop… persistent tunnels… | Single-outlet teaser (also below project-attention threshold) | Was present |
| 106 | A Limited Edition Gran Turismo DualSense Controller… | Single-outlet teaser | Was present |
| 107 | The XBOX Nano Controller… | Single-outlet teaser | Was present |
| 110 | (not) solitaire | Nothing behind headline | Was present as “Puzzmo made massively passively multiplayer solitaire” |

### Required survivors

All remain present after replay: Riverside/West Tamar house fire (7), Macquarie Point stadium builder (5), ambulance ramping (30), bird flu on Macquarie Island (40), jobless rate (2), Steele-John (1), Pope diagnosis (24), PAN-OS flaw (80), Ledger halt (95), Dota 2 update (45), and the 23savage bootcamp raid (43).

## Things I could not do or chose differently from the plan and why

- The plan points to an external Claude review artifact but does not embed its complete 20-junk/11-flawed story list. The network safety constraint permits only public feed reads, so I did not fetch that artifact. The replay grouping above is the reproducible reconstruction from the saved edition and the plan's named examples; every extra deterministic drop is listed separately.
- The saved candidates predate the new `images` array and therefore cannot prove full-photo URLs retroactively. I checked the current public r/homelab and r/selfhosted Atom formats, retained an Atom parser fixture, and report the four saved photo stories as fixed on re-collection rather than pretending their old thumbnail fields changed in place.
- I did not run Ollama vision. The request explicitly required a fake client; the unit test asserts the complete base64 `images` message.
- The workspace exposes Node `v24.18.1`, not a Node 22 binary. The implementation uses Node 22-supported APIs and `node:test`, but the reported test runs necessarily used the available Node 24 runtime.
- I did not touch containers, databases or services, and did not commit. I made no edits under `public/`; its concurrent Job 2 changes and report are outside this job.

## Settings/sources that need changing in the dev database

No database was changed. Merge these exact objects into each source's `config` JSON (preserving any unrelated existing keys):

- BoM Tasmania warnings — URL `https://www.bom.gov.au/fwo/IDZ00058.warnings_tas.xml`, source type `rss`, config:

```json
{"kind":"warning"}
```

- Every release source (GitHub release Atom feeds and the Unraid/UniFi announcement feeds), source type `rss`, config:

```json
{"kind":"release"}
```

- Pulse Tasmania, config:

```json
{"no_solo_top":true}
```

The warning and release parsers force their output to Tasmania and Homelab respectively, so stale `default_category` values do not override those contracts. Existing installs need no manual filler edit: startup migrates `filler_patterns_revision` to 8 while preserving custom additions/removals.
