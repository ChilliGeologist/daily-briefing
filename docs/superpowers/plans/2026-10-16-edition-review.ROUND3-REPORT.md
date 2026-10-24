# Edition review Round 3 report

## What changed

1. **Kicker sentence case on every write path**
   - `src/pipeline/writer/validate.js` now applies sentence casing to generated, interest-label, outlet and invalid-writer fallback kickers alike. A non-initial capital is retained only when the story evidence supports it mid-sentence; a lower-case use in the title, summary or teaser wins over a page heading or buried named report. This keeps genuine forms such as `Middle East`, `Black Sea` and `NAS`, while changing `Desktop BETA` when the story calls it a beta.
   - Source titles now contribute proper-name evidence when they are sentence-style, but a wholly Title Case title is not evidence that all its words are proper nouns.
2. **Court and testimony attribution in “How it was told”**
   - `src/pipeline/writer/told.js` removes a stance when the quote's source sentence contains any requested court, jury, evidence, testimony, allegation, prosecution or claim attribution.
   - `claims` as a reporting verb is attribution; a noun phrase such as `rejected the claims` is not, preserving the existing Steele-John control.
3. **Cluster-wide specialist routing**
   - `src/pipeline/writer/validate.js` forces Hacker News, `r/linux`, Waxy, Kottke and 404 Media out of World/Australia only when every named source is one of those specialist outlets or Reddit. One general-news outlet restores ordinary section routing.
4. **Protected gaming summary validation**
   - `src/pipeline/writer/validate.js` recognises the observed `No factual news details were provided` meta form.
   - `src/pipeline/writer/write.js` sends protected Dota 2/Old School RuneScape news through the normal missing-text retry even when the model returned `is_news: false`. Persistent invalid writing receives a title-derived factual sentence (`X has joined Y`; dated Dota updates use `Valve released …`).
   - A sentence that says only that comments were unrelated, off-topic or varied is removed. No reply facts are invented, and protected gaming title fallbacks are exempt from the low-text headline-echo rejection after validation.
5. **Shared Tasmanian place names**
   - `src/pipeline/writer/tasmanian-places.js` moves all 38 requested names to `NEEDS_COMPANION`.
   - The matching algorithm remains unchanged: a `NEEDS_COMPANION` match is never a companion for another such match. Thus `Waverley` cannot vouch for `Perth`.
   - `test/tasmanian-places.test.js` updates only the tier expectations changed by the move (`Invermay`, `Central Highlands`). The existing report test still passes unchanged.

The new whole-value regressions are in `test/edition-review-round3.test.js`.

## Tests

Baseline before Round-3 tests:

```text
npm test
297 tests: 297 passed, 0 failed
```

Failing-first run, before implementation:

```text
node --test test/edition-review-round3.test.js
8 tests: 0 passed, 8 failed
```

All five defect groups failed. The failures showed all six bad kickers unchanged; the Russell Brand subject surviving with `differs: true`; the mixed Reuters/404 cluster moving to Internet; protected gaming making one call and retaining meta/comment filler; and every newly listed shared place still appearing in `UNAMBIGUOUS`.

Final focused results:

```text
node --test test/edition-review-round3.test.js
8 tests: 8 passed, 0 failed

node --test test/edition-review-job1.test.js test/edition-review-round3.test.js test/tasmanian-places.test.js test/tasmania-places-report.test.js
34 tests: 34 passed, 0 failed
```

Final full-suite result:

```text
npm test
305 tests: 305 passed, 0 failed
```

`git diff --check` is clean. No containers, databases, services, dependencies or commits were used.

## Replay results

The replay read all 81 stories from `.codex-tmp/briefing-2026-10-16-r2.json`, converted the saved article HTML to source text, and applied the deterministic writer validation without model calls.

### Every kicker, before and after

Unchanged values are deliberately included. The six changes are marked **changed**.

| Section | ID | Before | After |
|---|---|---|---|
| Top | s2 | Oregon tragedy | Oregon tragedy |
| Top | s3 | Peshawar tragedy | Peshawar tragedy |
| Top | s17 | Black Sea incidents | Black Sea incidents |
| Top | s66 | Data breach | Data breach |
| Top | s41 | Security flaws | Security flaws |
| Tasmania | s6 | Hospital fundraiser | Hospital fundraiser |
| Tasmania | s11 | Stadium tender | Stadium tender |
| Tasmania | s27 | Highway cleared | Highway cleared |
| Tasmania | s33 | Tayene arrest | Tayene arrest |
| Tasmania | s36 | Riverside fire | Riverside fire |
| Tasmania | s7 | Stadium Cost | **Stadium cost** |
| Tasmania | s10 | Infrastructure support | Infrastructure support |
| Tasmania | s29 | Health debate | Health debate |
| Tasmania | s34 | Community milestone | Community milestone |
| Tasmania | s44 | Ferry dispute | Ferry dispute |
| Tasmania | s51 | Supermarket sale | Supermarket sale |
| Tasmania | s55 | Drug bust | Drug bust |
| Tasmania | s56 | Hotel dispute | Hotel dispute |
| Tasmania | s71 | Market opening | Market opening |
| Tasmania | s75 | Legal dispute | Legal dispute |
| Tasmania | s94 | Festival food | Festival food |
| Tasmania | s112 | Art Prize | **Art prize** |
| Australia | s1 | Legal credentials | Legal credentials |
| Australia | s12 | Party leave | Party leave |
| Australia | s8 | Health reform | Health reform |
| Australia | s42 | Cruise fleet | Cruise fleet |
| Australia | s62 | Airport disruption | Airport disruption |
| Australia | s25 | Lockdown lifted | Lockdown lifted |
| Australia | s76 | Court appearance | Court appearance |
| Australia | s79 | Trial visit | Trial visit |
| Australia | s85 | Legal charges | Legal charges |
| Australia | s98 | Adult Skills | **Adult skills** |
| Australia | s99 | Docklands revival | Docklands revival |
| Australia | s104 | Leadership changes | Leadership changes |
| Australia | s108 | Workplace reform | Workplace reform |
| Australia | s109 | Network trial | Network trial |
| Australia | s111 | Melbourne update | Melbourne update |
| World | s9 | Yemen Palace attack | **Yemen palace attack** |
| World | s14 | Border crossing | Border crossing |
| World | s21 | Energy strikes | Energy strikes |
| World | s22 | Legal proceedings | Legal proceedings |
| World | s13 | Trial evidence | Trial evidence |
| World | s15 | Citizenship probe | Citizenship probe |
| World | s32 | Toy shop dispute | Toy shop dispute |
| World | s39 | Election security | Election security |
| World | s52 | Election lawsuit | Election lawsuit |
| World | s53 | Surf suspension | Surf suspension |
| World | s58 | Sentence handed | Sentence handed |
| World | s59 | Tunnel incident | Tunnel incident |
| World | s61 | Middle East | Middle East |
| World | s80 | Electoral unrest | Electoral unrest |
| World | s81 | Homicide identification | Homicide identification |
| World | s82 | Peru incident | Peru incident |
| World | s83 | Capital unrest | Capital unrest |
| Tech | s18 | Spyware Attack | **Spyware attack** |
| Tech | s47 | Malware threat | Malware threat |
| Tech | s48 | Streaming expansion | Streaming expansion |
| Tech | s110 | Desktop BETA | **Desktop beta** |
| Tech | s86 | Kernel policy | Kernel policy |
| Tech | s24 | Roadster reveal | Roadster reveal |
| Tech | s28 | Driver development | Driver development |
| Tech | s50 | Desktop shift | Desktop shift |
| Tech | s67 | Launch delay | Launch delay |
| Tech | s87 | Screen mirroring | Screen mirroring |
| Tech | s95 | Launcher update | Launcher update |
| Homelab | s40 | Homelab setup | Homelab setup |
| Homelab | s63 | Lab setup | Lab setup |
| Homelab | s84 | Server build | Server build |
| Homelab | s113 | Switch tray | Switch tray |
| Homelab | s88 | Storage upgrade | Storage upgrade |
| Homelab | s103 | Productivity gaps | Productivity gaps |
| Gaming | s73 | Game script | Game script |
| Gaming | s74 | Game patch | Game patch |
| Gaming | s91 | Game cancellation | Game cancellation |
| Gaming | s92 | Expansion details | Expansion details |
| Gaming | s93 | Game removal | Game removal |
| Gaming | s89 | Handheld upgrade | Handheld upgrade |
| Gaming | s97 | Esports roster | Esports roster |
| Around the internet | s4 | Execution cancelled | Execution cancelled |
| Around the internet | s114 | Biking video | Biking video |
| Around the internet | s117 | Basin journey | Basin journey |

Result: **six changed, 75 unchanged**.

### Recomputed `told`

The saved `told` subjects and quotes were revalidated. The reader edition does not retain every outlet's source sentence, so the two Russell Brand evidence sentences were reconstructed from the saved lead article and the attribution identified in the review; all outlet names, headlines, URLs, subjects, stances and quotes came from the saved edition.

- **Russell Brand trial:** outlets are ABC Tasmania, The Australian and The Guardian. Both non-plain quotes are testimony attributed to the court and are removed. The remaining single plain stance is under-supported, so no subject survives and `differs` is absent/false (“Told much the same way”). Previously the Russell Brand subject survived with `differs: true`.
- **Trump execution livestream:** unchanged after validation. Outlets are SBS, Ars Technica, BBC, 404 Media, 7NEWS, AP and Reuters. Subjects are:
  - Donald Trump — SBS plain; Ars plain; 404 Media against; 7NEWS against; Reuters plain.
  - Pete Hegseth — SBS against; Reuters plain.
  - Execution Livestreaming — SBS, Ars, 404 Media, 7NEWS and Reuters against.
  - `differs: true` because the Trump and Hegseth subjects retain different stances.

### Recomputed sections

| Story | Before | After |
|---|---|---|
| Donald Trump cancels plan to livestream execution after international backlash | Around the internet | **World** |
| NSW artist becomes just fourth woman in 30 years to win major Sculpture by the Sea prize | Tasmania | **Australia** |

The Trump replay starts from the ordinary geographic result, because the saved Around the internet value was the erroneous result being reviewed. Its SBS, BBC, 7NEWS, AP and Reuters sources prevent the lone 404 Media source from forcing specialist routing.

### Gaming summaries

| Story | Saved summary | Replayed summary |
|---|---|---|
| Dota 2 Update for October 15, 2026 | A Dota 2 update for October 15, 2026, included fixes for the Primal Beast Immortal set's missing ability effect options. Community comments included unrelated discussion points. | **A Dota 2 update for October 15, 2026, included fixes for the Primal Beast Immortal set's missing ability effect options.** |
| Malr1ne Joins Team Liquid | No factual news details were provided regarding Malr1ne joining Team Liquid. Community comments included speculation about his skill level and the team's current state. | **Malr1ne has joined Team Liquid.** |

The first result retains the real patch fact and strips only the unrelated-comments sentence. Malr1ne takes the normal retry, receives the same invalid meta writing in the replay, then uses the title fallback. A separate whole-value test verifies the other persistent-meta fallback exactly as **“Valve released a Dota 2 update on 15 October 2026.”**

## Over-reach check

Exactly one story in the saved Tasmania section moves out under the new place tiers: the **Sculpture by the Sea** story (`s112`), Tasmania → Australia. `Waverley` and `Perth` are both rejected without independent Tasmanian evidence.

All 16 required controls stay in Tasmania:

| ID | Control story | Resulting section |
|---|---|---|
| s6 | Kings Meadows fundraiser | Tasmania |
| s11 | UTAS Stadium caterers | Tasmania |
| s27 | Channel Highway ferry | Tasmania |
| s33 | Tayene arrest | Tasmania |
| s36 | Riverside fire | Tasmania |
| s7 | Stadium builder | Tasmania |
| s10 | Firmus | Tasmania |
| s29 | Ambulance ramping | Tasmania |
| s34 | Neighbourhood Watch | Tasmania |
| s44 | Spirit ferry | Tasmania |
| s51 | Branxholm IGA / rural supermarket | Tasmania |
| s55 | E-scooter drug case | Tasmania |
| s56 | Gorge Hotel | Tasmania |
| s71 | Op-shop market | Tasmania |
| s75 | Legal Aid lawyer | Tasmania |
| s94 | Taste of Summer | Tasmania |

No other Tasmania-section story moves. `test/tasmania-places-report.test.js` passes with its existing report output; the gazetteer tier unit test contains the only expectation updates required by the 38 moves.
