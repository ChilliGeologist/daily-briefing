# Edition review Round 2 report

## What changed

1. **Deterministic sport detection and disposition**
   - `src/pipeline/writer/validate.js` detects sport from `/sport/` and `/sports/` URL paths and from the requested leagues, teams, competitions and sport terms in the title, description and opening article text. Opening text is capped at 120 words so unrelated publisher footers cannot classify a story. Stadium construction/cost/funding/development remains news rather than sport unless actual play is also described.
   - The same file enforces the existing significance rule in code: final-stage big events, coverage of at least four, or a listed Tasmanian team with coverage of at least two. A World Cup group/opener match is not intrinsically big. Every qualifying sport item is forced to Sport; every other detected sport item is dropped.
   - `src/pipeline/writer/interests.js` adds `Tasmania Jewels` and place-qualified `Jewels` to Events. The sport keep check recognises `Tasmania's Jewels`/`Tasmania Jewels`, and bare `Jewels` only with a matched place.
2. **Round-ups**
   - `src/pipeline/writer/write.js` drops all requested newsletter prefixes, titles containing at least two semicolons, and Reddit links to root/home pages whose extracted source is visibly a multi-story category listing. This catches the Pulse Tasmania/Hazell Bros item before writing.
3. **Advertorial**
   - `src/pipeline/writer/write.js` drops `Cooking with <brand>` titles, the requested disclosure phrases in title/description, and the four advertorial URL path forms.
4. **Photo-post scope**
   - `src/pipeline/writer/write.js` now treats only Reddit-owned image/gallery content (`i.redd.it`, eligible `preview.redd.it`, Reddit galleries and `i.imgur.com`) as a photo post. External article links cannot borrow the photo or reply-count discussion exemptions; the saved Slate/Kelly Clarkson link therefore has to pass on linked article text and does not.
5. **Help requests**
   - `src/pipeline/writer/validate.js` applies the requested title forms regardless of score or reply count, including first-person setup questions. General questions such as “Do you not patch your docker images against CVEs?” remain eligible.
6. **Interest-list gaming news**
   - `src/pipeline/writer/validate.js` identifies Dota 2/Old School RuneScape update, patch, hotfix, roster, signing, transfer and tournament-win news from an interest match or the product's own source.
   - `src/pipeline/writer/write.js` exempts a qualifying item with at least three real replies (or a news outlet) from the text gate and deterministically overrides a writer `not_news` answer. Post text and replies remain available to the ordinary writer prompt.
7. **How it was told validation**
   - `src/pipeline/writer/told.js` locates each quote in that outlet's own sentence, removes quotation/attribution evidence, converts unloaded accusation/charge/plea/verdict reporting to `plain`, removes all-plain subjects, and derives `differs` only from the surviving post-validation stances.
   - No display edit was needed: the existing outlets-only reader state already shows headlines plus “Told much the same way.”
8. **Homelab routing**
   - `src/pipeline/writer/validate.js` forces single-outlet Jeff Geerling, ServeTheHome, selfh.st, Home Assistant blog, Tailscale blog and release-source stories to Homelab. Titles containing `self-host`, `selfhost`, `self-hosted` or `homelab` go there regardless of source.
9. **BoM request header**
   - `src/pipeline/sources/rss.js` sends warning sources a full desktop Chrome user agent instead of the bot-style Mozilla compatibility string.
10. **Short link-blog items**
    - `src/pipeline/sources/rss.js`, `src/pipeline/sources/reddit.js` and `src/pipeline/sources/api.js` propagate `config.short_ok` as `short_ok` on an item.
    - `src/pipeline/writer/write.js` exempts it only from the single-outlet 150-word teaser rule. The under-40-word rule still applies.

Tests are in `test/edition-review-round2.test.js`, with updated whole-value expectations in `test/interests.test.js`, `test/writer-validate.test.js` and `test/writer-write.test.js`.

## Tests

Failing-first evidence was recorded before implementation with:

```text
node --test test/edition-review-round2.test.js
12 tests: 1 passed, 11 failed
```

The failures covered sport detection and Jewels interests, missing round-up/photo/gaming helpers, advertorial gates, high-engagement help, attributed/legal/all-plain `told` handling, Homelab routing, the BoM user agent, `short_ok` propagation, and the teaser exemption. A replay-driven stadium-infrastructure regression was then added and run before its exclusion:

```text
node --test --test-name-pattern='detects sport' test/edition-review-round2.test.js
1 test: 0 passed, 1 failed
```

A final quote-mark boundary test was likewise run before adding straight single-quote handling:

```text
node --test --test-name-pattern='straight single' test/edition-review-round2.test.js
1 test: 0 passed, 1 failed
```

Final results:

- `node --test test/edition-review-round2.test.js`: **13 passed, 0 failed**.
- `npm test`: **296 passed, 0 failed**, 28 suites.
- `git diff --check`: clean.

Every new regression assertion compares a complete boolean/result array, returned object, routed-section array, or request/result object rather than checking a substring. No containers, databases, services, model calls, commits or `public/` files were used or changed.

## Replay results

The replay loaded all 120 entries from `.codex-tmp/candidates-2026-10-16.json` and applied the new deterministic gates directly. Old sections below come from `.codex-tmp/briefing-2026-10-16.json`; “not printed” means the first writer had already omitted it.

### Named stories

| Candidate | Old result | Round-2 result |
|---|---|---|
| Supercars to return to Phillip Island… | Australia | **Drop** — sport below threshold (coverage 2) |
| Cowan handed AFL suspension… | Australia | **Drop** — sport below threshold (coverage 1) |
| Wallaroos believe “possibilities are endless”… | Australia | **Drop** — sport below threshold (coverage 1); a future World Cup is not a final stage |
| How the joy of Pride is “a form of resistance”… | Australia | **Drop** — AFLW sport below threshold (coverage 1) |
| De Minaur falls to world number one Zverev… | World | **Drop** — tennis below threshold (coverage 1) |
| World Cup opener a reminder of Test rugby league's glory days | World | **Drop** — non-final World Cup match below threshold (coverage 1) |
| Tasmania's Jewels enter WNBL with debut win | Tasmania | **Keep; move to Sport** — listed Tasmanian team, coverage 2 |
| Guardian Morning Mail… | Tasmania | **Drop** — multi-story round-up/newsletter |
| r/tasmania/Pulse Tasmania item written as “Hazell Bros opens…” | Tasmania | **Drop** — linked source is a multi-story home-page round-up |
| Cooking with Coles… | Australia | **Drop** — advertorial |
| Kelly Clarkson Store Saga/Slate link | World | **Drop** — external article link, zero linked-article words; not a photo/discussion post |
| Can you P2P proxy + access controll? | Homelab | **Drop** — personal help request regardless of replies |
| First attempt, what's next? | Homelab | **Drop** — personal help request regardless of replies |
| Dota 2 Update for October 15, 2026 | Not printed | **Keep in Gaming** — product update with 30 real replies |
| Malr1ne Joins Team Liquid | Not printed | **Keep in Gaming** — Dota roster news with 71 real replies |
| What I Self-Host | Tech | **Keep; move to Homelab** — title rule |

### Required survivors

All required controls return no deterministic drop reason: Oregon school shooting (rank 2), HMAS Leeuwin person of interest (12), AdFection spyware (13), Houthi strike in Aden (17), Peshawar school roof collapse (1), Trump execution-livestream cancellation (4), Plex movie tickets (44), Sonarr torrent malware (31), D-Link/Ubiquiti proxyjacking (32), Riverside/West Tamar house fire (30), Macquarie Island bird flu (3), stadium builder (11), and Launceston op-shop market (65).

The stadium builder is explicitly **not sport**: its AFL mention concerns construction, price and government delivery. This was the replay-discovered regression covered by the second failing-first run above.

## Over-reach list

These are every other saved candidate dropped or moved by a Round-2 rule, so the boundary is reviewable:

| Rank | Candidate | New result | Old edition |
|---:|---|---|---|
| 23 | Aussies win all-time World Cup classic… | Drop — non-final rugby league World Cup match, coverage 2 | Not printed |
| 25 | How can background tasks be offloaded…? | Drop — help/setup question | Printed in Tech under the linked Formlabs headline |
| 40 | How do I get my wife on the bandwagon of self hosting…? | Drop — help request | Not printed |
| 51 | Hold All Tickets… Everest and Caulfield Cup preview | Drop — sport below threshold (and already under 40 article words) | Not printed |
| 67 | Moving to Hobart to open a salad bar… advice | Drop — advice request | Not printed |
| 81 | Sport presenter Danika Mason joins Today exodus | Drop — NRL-linked sport item below threshold | Australia |
| 100 | More than 1 in 3 Australian adults are functionally illiterate. How can we fix this? | Drop — title contains the requested `how can` form | Australia |
| 120 | Inside the Secretive AWS Networking Lab | Keep; Tech → Homelab — single-outlet ServeTheHome source | Tech |

No other candidate changes under the new Round-2 rules. Existing Round-1 text-length, project, essay, filler and unanswered-question decisions were not counted as Round-2 over-reach.

## Recomputed `told` results

The replay took each saved `told` object as the model result, validated it against the matching candidate's saved `outlet_versions`, and made no model calls. “Outlets only” means no subject survives and the reader shows headlines plus “Told much the same way.”

| Rank | Story | Recomputed subjects | `differs` |
|---:|---|---|---:|
| 2 | Oregon school shooting | Outlets only (10) | false |
| 12 | HMAS Leeuwin recording device | Outlets only (4); SBS/Guardian minister quotations removed | false |
| 13 | AdFection spyware | Spyware/Malware — Ars against; 404 Media against | false |
| 17 | Houthi strike in Aden | Houthi rebels — AP plain; Reuters against; The Australian plain. Al Jazeera's Saudi-attributed “war crimes” stance removed | true |
| 3 | Macquarie Island bird flu | Outlets only (3) | false |
| 11 | Stadium builder | Outlets only (2) | false |
| 10 | Tasmania Jewels | Outlets only (2) | false |
| 59 | Sacked Legal Aid lawyer | Outlets only (2) | false |
| 5 | Woman charged over poisoned lunch | Outlets only (5); charge/allegation stances became plain, then subject removed | false |
| 8 | Jordon Steele-John complaints | Outlets only (5) | false |
| 34 | Sydney Airport strikes | Security Staff — Daily Telegraph against; news.com.au against | false |
| 33 | Trump press secretary/bar exam | Outlets only (2) | false |
| 81 | Danika Mason/Today | Outlets only (3) | false |
| 1 | Pakistan school roof collapse | School/Building — SBS against; Reuters plain; The Australian plain | true |
| 4 | Trump execution livestream | Outlets only (7) | false |
| 16 | China–North Korea bridge | Outlets only (5) | false |
| 19 | Maduro torture charges | Outlets only (3) | false |
| 20 | Tankers struck near Romania | Outlets only (4) | false |
| 21 | White House press secretary credentials | White House — BBC toward; AP plain; Reuters plain | true |
| 22 | Ukraine refinery attack | Outlets only (3) | false |
| 36 | Tech market sell-off | Tech Market — Reuters plain; Guardian against | true |
| 43 | California voter-roll lawsuit | Outlets only (3) | false |
| 48 | Donaldson sentence | Outlets only (3) | false |
| 49 | Brazil shorter workweek | Lula — BBC toward; AP toward | false |
| 62 | Ukraine evacuation drone | Outlets only (3) | false |
| 66 | Suspicious-substance letters | Outlets only (2) | false |
| 14 | Steam/Epic launchers | Outlets only (3) | false |
| 52 | UK Legal Aid breach | Outlets only (2) | false |
| 60 | Neutron launch delay | Outlets only (2) | false |
| 70 | ASUS ROG Ally X20 | Outlets only (2) | false |

This leaves four stories with `differs: true`: Houthi/Aden, Pakistan roof collapse, White House press secretary credentials, and the tech-market sell-off. Same-direction subjects (AdFection, Sydney Airport and Lula) remain valid context but correctly have `differs: false`.

## Source config JSON to set

Merge this exact JSON into both the Kottke and Waxy source configs, preserving unrelated keys:

```json
{"short_ok":true}
```

No source database was changed. The BoM warning source continues to use `{"kind":"warning"}`; the code change applies the desktop Chrome header automatically to that kind.
