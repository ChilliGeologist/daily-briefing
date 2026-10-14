# Stage 4 reading screen — Tasks 1–5 report

Date: 2026-10-14

Scope: Tasks 1–5 only. Task 6's interaction and Task 7's complete styling/theme work are deliberately deferred to the second dispatch.

## Task 1 — Pure section, gesture and curl helpers

- Added `public/reading-logic.js` with a frozen universal `ReadingLogic` API containing `prepareSections`, `decideGesture` and `settleGesture`.
- `prepareSections` moves `top` first, also recognises a legacy no-id `You should know` section, caps ordinary `items` at five, retains all overflow and `more` stories in order, removes repeated ids by first occurrence across the edition, retains id-less legacy stories and does not mutate the payload.
- Gesture direction locking and settling use the plan's exact 8 px, one-third and 0.5 px/ms boundaries.
- Added `public/curl-geometry.js` with a frozen universal `CurlGeometry` API containing `nearestCorner`, `clipHalf` and `curlFrame`.
- Curl geometry follows `page-curl.html`: sine lift, perpendicular-bisector crease, four-edge half-plane clipping, crease reflection, fold width, and the exact curl/crease/cast light constants.
- Added pure `node:test` coverage in `test/reading-logic.test.js` and `test/curl-geometry.test.js`. Floating-point tolerance is used only for geometry.

## Task 2 — Layered reading-stage shell

- Loaded both classic helper scripts before `app.js`.
- Replaced only the `/` view with `#reading-stage`, in the required stacking order: reader, reader shadow, briefing, front crease shadow and inert flap/ghost.
- Added the real reader Back button, empty story header and article body. Reader and ghost start inert; curl layers have no focusable content or pointer handling.
- Retained the masthead controls, Archive, Settings and Status panels, settings template, ids and loaders.
- Changed only `/` to route through `reading-stage` and added the app-root `data-view` route marker for scoped Paper CSS.
- Added `resetReadingStage()` to cancel staged curl state, clear reader/ghost content and presentation, and restore briefing interactivity on edition changes and route exits.

## Task 3 — Paper briefing and complete section lists

- Replaced the card renderer with rust newspaper labels, ruled story lists, quiet kickers, serif headlines and summaries. Icons, count chips, significance rails, thumbnails and read opacity are not used on the reading route.
- The configured app title is retained, with `The Daily Gump` as the fallback. The edition date is the centred masthead line; the aggregate briefing headline is not repeated.
- Story nodes use DOM construction and `textContent`. Stable ids drive data/control relationships, id-less stories receive a per-render fallback, and story objects stay in memory rather than attributes.
- Existing `read-<date>` storage is neither read nor deleted by the new screen.
- Against the supplied development briefing, partitioning retains all 109 stories: 37 initially visible and 72 behind More controls. This includes seven headline-only stories and three blank-kicker stories.

## Task 4 — One-at-a-time expansion and More

- Added one delegated briefing click handler for native story, More and Read in full buttons.
- Only one story can be expanded across the edition. Empty kicker, summary and detail elements are omitted.
- Expansion uses `grid-template-rows: 0fr` to `1fr`, with the approved inner opacity and `-6px` slide. Reduced motion disables those transitions.
- Expansion shows available detail, source names, reading time and a real `Read in full` button, including for headline-only stories.
- More initially leaves overflow unrendered/hidden, then appends every hidden story once in original order. `Show less` closes a hidden expanded story and restores focus to the More button when necessary.
- Reading actions have visible keyboard focus and 44 px minimum action targets.

## Task 5 — Safe reader and history

- Added `renderReader(item)` for optional kicker, title, source/byline, reading time, safe hero image, article body/fallback and original-site link.
- Only server-sanitised `article_html` is assigned to a detached template's `innerHTML`; the code comment records the stage 2 trust boundary. Every other value uses DOM methods, `textContent` and `safeUrl()`.
- Empty or non-meaningful article HTML falls back to the plain-text summary. Headline-only stories still render their header and safe original-site link. Partial extracted HTML is shown as supplied, followed by that link.
- Read in full pushes one `/?story=<id>` entry with edition/story state and does not push again for an already-open story.
- Popstate opens or closes the reader against the in-memory edition. Stale/direct unresolved story URLs are replaced with `/`.
- Back and Escape use `history.back()` for app-created entries; direct reader loads replace the URL and close locally.
- Reader entry saves briefing scroll, starts the reader at the top, makes briefing inert and focuses Back. Return restores briefing interactivity, scroll and the opening story toggle when it is visible.

## Test evidence

- Initial red run before helper implementations: `node --test test/reading-logic.test.js test/curl-geometry.test.js` — 23 tests, 0 passed, 23 failed because the APIs did not exist.
- Legacy top-section red run: 24 tests, 23 passed, 1 failed before that edge case was implemented.
- Final focused run: 24 tests, 24 passed, 0 failed.
- Final full run: `npm test` — 210 tests, 210 passed, 0 failed, 16 suites.
- Parse/static checks: `node --check public/app.js`, `node --check public/reading-logic.js`, `node --check public/curl-geometry.js` and `git diff --check` all passed.

## Plan deviations

- No deviation within Tasks 1–5.
- Per this dispatch's explicit scope, Task 6 pointer input, curl DOM cloning/rendering, lighting application and settling animation are not wired. The full pure geometry and gesture decision APIs are complete and the curl layers are laid out.
- Per this dispatch's explicit scope, only the light Paper layout/type/expansion CSS needed to make Tasks 3–5 usable was added. Task 7's complete responsive tokens, warm dark palette, Auto theme, sun-time module/tests and theme-colour work are not included.

## Browser and Task 8 verification

No browser, viewport, pointer, touch, keyboard, theme or reduced-motion checks were performed, and no Playwright/jsdom/browser automation was used. Task 8's eleven checks remain for Jesse after the second dispatch. In particular, unit tests do not verify layout at 360–430 px, scrolling, pointer feel, focus movement in a browser, browser history behaviour, article rendering, route transitions or visual isolation of the three panels.

---

# Stage 4 reading screen — Tasks 6–7 report

Date: 2026-10-14

Scope: Tasks 6 and 7. Task 8 remains Jesse's manual dev-container verification.

## Task 6 — Approved interactive page curl

- Wired the briefing and reader pointer paths to the existing pure `ReadingLogic` and `CurlGeometry` APIs. A gesture remains undecided below 8 px, vertical-first motion is released without pointer capture or cancellation, and only a valid leftward story gesture or rightward reader gesture locks horizontally.
- Kept the approved curl state and equations: nearer right corner, 0.6 vertical drift, sine lift, perpendicular-bisector crease, complementary half-plane clips and the midpoint-based reflection matrix. Endpoint rendering removes clips and shadows and hides the flap.
- Applied the mockup's exact curl, crease and reader-cast gradient strengths and widths from helper output on every rendered frame.
- Built the reverse print by deep-cloning briefing DOM nodes. The clone has ids, links and form/control behaviour removed, stays inert and `aria-hidden`, uses opacity `0.09`, follows briefing scroll, and refreshes after edition rendering, story expansion and More changes. No HTML string is used for the ghost.
- Added forward and back pointer settling with the one-third and `0.5 px/ms` helper thresholds. Failed forward turns do not touch history; completed forward turns push one story entry only after reaching the reader. Completed back turns perform the existing history return only after reaching the briefing.
- Programmatic Read in full and Back turns use a grab at 80% of stage height. Settling uses `max(200, 700 × distance)` milliseconds, cubic ease-out and eases vertical drift to zero.
- Suppressed the post-swipe synthetic click, re-renders geometry after resize/orientation changes, cancels an invalidated story target, and clears active curl state on edition or route changes.
- Reduced motion preserves gesture decisions and thresholds, skips fold geometry entirely, leaves rejected gestures unchanged, and uses a 150 ms cross-fade for completed navigation. Story expansion motion remains disabled under the same preference.

## Task 7 — Responsive Paper, themes and article typography

- Replaced the provisional reading values with one complete Paper token set. Light uses the approved cream values; dark uses warm charcoal `#211e1a`/`#28231e`, warm off-white ink, taupe supporting text/rules and accessible light rust. Panel tokens and panel route styling remain separate.
- Finished phone-first Paper sizing and gutters, safe-area padding, 44 px actions, bounded long text, tablet/desktop centring at 800 px, a 65-character article measure, and sheet framing against the surrounding app background.
- Added reading typography for sanitised headings, paragraphs, lists, blockquotes, figures, captions, links and bounded responsive images. Optional broken hero images retain the existing removal behaviour.
- Added `100dvh` with `100vh` fallback, momentum scrolling, contained vertical overscroll for the two reading layers, mouse-only hover styles, focus-visible rings and reduced-motion overrides.
- Theme-colour now follows the active Paper page on `/` and the existing app background on Status, Settings and Archive.
- Added Settings theme order Auto, System, Light, Dark. `auto` uses the existing `theme` storage key; unknown values resolve to System and existing values are unchanged.
- Added pure `public/sun-times.js` with NOAA equation-of-time, solar-declination and standard-refraction calculations for 41.30° S, 146.98° E. Dates are resolved in `Australia/Hobart`, including daylight saving. Auto selects dark from sunset through sunrise, schedules one timer for the next boundary, re-evaluates on visibility and clears that timer for every non-Auto choice.
- Bumped the service-worker cache and precached the three pure helper scripts so an installed app cannot combine an old cached shell with the new `app.js` dependency.

## Test evidence

- Required red run after adding the new sun tests but before `sun-times.js`: `node --test test/reading-logic.test.js test/curl-geometry.test.js test/sun-times.test.js` — 28 tests, 24 passed, 4 failed. Each new sun test failed with `TypeError: sunTimesForDate is not a function`.
- Sun implementation green run: `node --test test/sun-times.test.js` — 4 passed, 0 failed.
- Final targeted run: `node --test test/reading-logic.test.js test/curl-geometry.test.js test/sun-times.test.js` — 28 passed, 0 failed.
- Final full run: `npm test` — 214 tests, 214 passed, 0 failed, 16 suites.
- Static checks: `node --check` passed for `public/app.js`, `public/reading-logic.js`, `public/curl-geometry.js`, `public/sun-times.js` and `public/sw.js`; `git diff --check` passed.

## Dark Paper contrast

WCAG contrast ratios were calculated from sRGB relative luminance against both dark reading surfaces. Regular text/actions exceed 4.5:1 and the focus indicator exceeds the 3:1 non-text threshold.

| Token | Colour | On page `#211e1a` | On reader `#28231e` |
| --- | --- | ---: | ---: |
| Ink | `#f4ede3` | 14.28:1 | 13.39:1 |
| Muted/quiet | `#b3a697` | 6.97:1 | 6.53:1 |
| Rust action | `#ee936b` | 7.13:1 | 6.69:1 |
| Focus ring | `#ffb08b` | 9.35:1 | 8.77:1 |

## Launceston sun-time comparison

Published times are local Launceston times from timeanddate.com: [June 2026](https://www.timeanddate.com/sun/australia/launceston?month=6&year=2026), [December 2026](https://www.timeanddate.com/sun/australia/launceston?month=12&year=2026), and [October 2026](https://www.timeanddate.com/sun/australia/launceston?month=10&year=2026). The October date is the 2026 daylight-saving changeover.

| Date | Computed sunrise | Published sunrise | Computed sunset | Published sunset |
| --- | ---: | ---: | ---: | ---: |
| 21 June 2026 | 07:37:49 | 07:37 | 16:49:00 | 16:48 |
| 21 December 2026 | 05:35:11 | 05:33 | 20:44:38 | 20:44 |
| 4 October 2026 | 06:41:59 | 06:41 | 19:19:17 | 19:20 |

Every computed boundary is within the required three minutes of the published minute.

## Plan deviations

- No behavioural deviation from Tasks 6–7.
- `public/index.html` was necessarily changed to add the Auto control and load the pure sun module. `public/sw.js` was also changed to invalidate the installed-app shell and precache all three helper dependencies; otherwise an existing cache could serve a shell that does not load `sun-times.js`.

## Browser verification still required

No browser automation, jsdom or manual browser run was used. Unit tests do not verify layout at 360, 390 or 430 px, tablet/desktop framing, 200% zoom, safe-area rendering, native scrolling, pointer feel, corner choice on screen, reverse-print alignment, gradient appearance, focus movement, browser-history timing, installed-app cache update, theme appearance, live timer switching or reduced-motion cross-fades. Task 8's numbered manual checks remain for Jesse.

---

# Follow-ups from Jesse's review (2026-10-14)

## Outcome

- Removed More/Show less entirely. `prepareSections` now keeps first-occurrence de-duplication and top-first ordering while putting every `items` story followed by every `more` story in `shown`; `hidden` is always empty.
- Added a two-column briefing at 700 px and a three-column broadsheet at 1024 px. At the desktop breakpoint, You should know spans the sheet: its lead takes two thirds and the remaining picks stack in the final third. Topic sections use three columns and rules; expansion remains inside its story column. The article reader remains 65ch.
- Restyled the masthead with the system serif stack, a heavy high-contrast title, double rules above and below, and a small-caps long-date edition line. No font or other network request was added.
- The no-article reader fallback now uses `detail`, then `summary`. Stored community stories also carry capped plain-text post text and up to five cleaned replies; the reader renders them with `textContent` under “What people said”. The only HTML parsing boundary remains sanitised `article_html`.
- Centralised four community-boilerplate reply patterns. Cleaned replies now feed the writer prompt, unanswered-question rule and stored reader shape. A community title containing a question mark is not news below two real replies. Settings filler revision 4 adds a standing Discussion Thread pattern.
- Bumped the service-worker cache to v4 so installed copies receive the changed scripts and styles together.

Community storage caps are 6,000 characters for post text and five replies of 1,000 characters each.

## Files changed

- `public/app.js` — removed More state/rendering and added safe detail/community reader rendering.
- `public/reading-logic.js` — all-story section preparation and pure reader-content selection.
- `public/style.css` — masthead polish, community reader styles and 700/1024 px newspaper layouts.
- `public/sw.js` — cache version bump.
- `src/pipeline/assembler.js` — community-only post/reply storage with caps.
- `src/pipeline/writer/prompts.js` — shared boilerplate patterns/reply cleaner and cleaned writer comments.
- `src/pipeline/writer/validate.js` — unanswered community-question predicate.
- `src/pipeline/writer/write.js` — deterministic enforcement of the new predicate.
- `src/settings.js` — filler revision 4 and Discussion Thread default.
- `test/assembler.test.js` — community storage boundary and cap coverage.
- `test/reading-logic.test.js` — complete-section and reader-content whole-value coverage.
- `test/settings.test.js` — revision 4 seed and upgrade coverage.
- `test/writer-prompts.test.js` — shared-pattern and cleaned-prompt coverage.
- `test/writer-validate.test.js` — reply-counting boundary coverage.
- `test/writer-write.test.js` — writer-stage enforcement coverage.
- `docs/superpowers/plans/2026-10-14-stage4-reading-screen.REPORT.md` — this follow-up record.

## Test evidence

- Red run after adding/changing the focused assertions and before implementation: `node --test test/reading-logic.test.js test/writer-prompts.test.js test/writer-validate.test.js test/writer-write.test.js test/assembler.test.js test/settings.test.js` — 88 tests, 71 passed, 17 failed. Every new test failed on its absent behaviour; the changed all-story/revision assertions failed on the old behaviour.
- Focused green run: the same command — 88 passed, 0 failed.
- Full green run: `npm test` — 221 passed, 0 failed, 16 suites.
- `node --check` passed for every changed JavaScript source and `git diff --check` passed.

## Real-data check: all eight mornings

The read-only pass covered 287 community-candidate occurrences: 102 unique community posts and 27 unique question-mark titles. Reply totals below are after boilerplate removal; occurrence counts show repeats across the eight snapshots.

### Questions caught

- `Anyone using Domoticz over HA? Curious to hear your experiences.` — 1 real reply; 3 occurrences.
- `What's the deal with an AI-generated meme character ending up in a federal lawsuit?` — 0 real replies; 2 occurrences.
- `“No database required” sounds simpler—but when is a JSON file actually the better choice?` — 1 real reply; 1 occurrence.

### Questions kept by the reply threshold

- `Tasmanian council refused to waive a parking fine despite a medical emergency. Is this normal?` — 8 real replies; 8 occurrences.
- `BUG: Game Stuttering & Graphic Bugged Since Trove Of Terror Dropped?` — 7 real replies; 1 occurrence.
- `Have a question about the game or the subreddit? Ask away!` — 8 real replies; 6 occurrences.
- `Proxmox Home lab ideas?` — 8 real replies; 1 occurrence.
- `What is happening over at SparkyFitness? Dev wants us to stop paying him 😅` — 7 real replies; 4 occurrences.
- `These are the kind of reactions I get when I recommend Anubis to deal with bots at work, what alternatives are there?` — 7 real replies; 5 occurrences.
- `Moving to Claremont or Kingston?` — 8 real replies; 4 occurrences.
- `Why isn't there a 'I busted a nut climbing The Nut' t-shirt at the giftshop?` — 8 real replies; 4 occurrences.
- `What's going on with Jennifer Meyers?` — 5 real replies; 4 occurrences.
- `Is wireguard good enough for personal remote access to home network?` — 8 real replies; 4 occurrences.
- `How many containers is your media stack at now?` — 7 real replies; 2 occurrences.
- `Running a Debian home server on an old laptop what should I self-host next?` — 6 real replies; 2 occurrences.
- `Is rhis good for a beginner?` — 8 real replies; 4 occurrences.
- `What's going on with Susan Dell?` — 7 real replies; 2 occurrences.
- `Whats up with canceling Metallica?` — 7 real replies; 5 occurrences.
- `16x16px Dota 2 Heroes – Can You Recognize Them? (Pt. 2)` — 8 real replies; 1 occurrence.
- `How much are Coles and Woolworths making from 30c paper bags?` — 8 real replies; 1 occurrence.
- `Always on dev server + jellyfin (+ bitwarden) on mac mini. How do I secure it?` — 8 real replies; 3 occurrences.
- `Dota is really chill and fun now???` — 8 real replies; 3 occurrences.
- `Found while dumpster diving. Keep, Use, Salvage or sell?` — 8 real replies; 3 occurrences.
- `If a remote site's cellular drops for days, how would you get a heartbeat out? (just curious)` — 8 real replies; 3 occurrences.
- `Why do you NOT use IPv6?` — 8 real replies; 3 occurrences.
- `Why aren't 12V DC UPs more common?` — 8 real replies; 3 occurrences.
- `What do you think was the biggest turning point in Linux desktop history?` — 8 real replies; 2 occurrences.

This section reports the new reply threshold only; the existing help-request and filler rules can still reject a kept title independently. Both named non-question showcases stayed: `My small homelab: one Proxmox host and a NAS in a 16U rack` and `Honey, I shrunk the homelab`. The revision-4 filter caught `[no-politics] Everything overpriced Discussion Thread 14/Oct/2026` in all 3 occurrences with `filler: /\bdiscussion\s+threads?\b/i`.

### Boilerplate pattern hits, verbatim

The four patterns hit 79 reply occurrences. Each distinct matching reply is reproduced here once, verbatim, with its occurrence count.

- 60 occurrences:

  > Expand the replies to this comment to learn how AI was used in this post/project.

- 13 occurrences:

  > Friendly reminder that all top level comments must: start with "Answer: ", including the space after the colon (or "Question: " if you have an on-topic follow up question to ask), attempt to answer the question, and be unbiased Please review Rule 4 and this post before making a top level comment: http://redd.it/b1hct4/ Join the OOTL Discord for further discussion: https://discord.gg/ejDF4mdjnh I am a bot, and this action was performed automatically. Please contact the moderators of this subreddit if you have any questions or concerns.

- 3 occurrences:

  > This post has been marked as non-political. Please respect this by keeping the discussion on topic, and devoid of any political material. I am a bot, and this action was performed automatically. Please contact the moderators of this subreddit if you have any questions or concerns.

- 3 occurrences:

  > Thanks for reporting this bug! Check out the General Dota 2 Bug Tracker and Tracker for Linux and Mac PLEASE THROUGHLY CHECK IF YOUR BUG HAS ALREADY BEEN REPORTED. Duplicate issues can slow the dev team when resolving a bug. If you find an existing issue for your bug, please upvote the thread. You can also provide additional information and match IDs to further assist the development team. If not, create a new issue (general tracker / Linux & Mac) with as much information as possible: A detailed description of the bug System info (i.e. operating system) Match IDs (if applicable) Screenshots or video (if applicable)" I am a bot, and this action was performed automatically. Please contact the moderators of this subreddit if you have any questions or concerns.

## Browser verification still required

No browser automation, jsdom or manual browser run was used. Pure-function and server tests do not verify the masthead's visual weight, real column flow and rules at 700/1024 px, expansion reflow inside columns, whole-sheet curl appearance at the wider stage width, 200% zoom, community text appearance, touch/pointer feel, focus movement or installed service-worker refresh. Jesse should check those in the dev container.

## Thumb index

Implemented the approved Niagara-style section index for every non-empty section in the rendered edition. The production strip uses the prototype's 36 px right-edge hit area, 18 px icons, 30–92% vertical layout, `AMP 46`, `SIGMA 44`, `GROW 1.15`, story-picking reach multiplier `0.35`, active/release spring constants, 36 px sideways threshold, 150 ms ease-out glide and 5 ms vibration tick. The active section name is assigned with `textContent`, and its pill stays 10 px beyond the scaled icon's outer edge.

The eight approved SVG drawings are reproduced as static SVG DOM nodes beside headings and in the strip. No briefing, story, section or settings value enters HTML parsing; unknown section ids select the front-page drawing. Sliding off the strip highlights the story row under the pointer and release opens it without disturbing the one-at-a-time expansion rule. Ordinary scrolling marks the section nearest the briefing top, while arrow keys move the focusable slider and update `aria-valuenow` and `aria-valuetext`.

Reduced motion retains selection, pill, haptic attempt and direct section jumps, but bypasses bowing, springs, gliding and strip transitions. The cache version is v5 and includes the new helper.

### Files changed

- `public/app.js` — static SVG construction, thumb-index rendering/state, pointer and keyboard handling, scrolling, story targeting, and curl/reader coexistence.
- `public/index.html` — thumb-index layer and helper-script load.
- `public/style.css` — edge strip, heading icons, pill, target wash, focus, reduced-motion and matching right gutter styles.
- `public/thumb-index-logic.js` — dependency-free layout, nearest-section, Gaussian target, pill-offset and icon-id helpers.
- `public/sw.js` — v5 cache bump and helper precache entry.
- `test/thumb-index-logic.test.js` — whole-value and floating-tolerance coverage for the four requested pure helper areas and unknown-icon fallback.
- `docs/superpowers/plans/2026-10-14-stage4-reading-screen.REPORT.md` — this implementation record.

### Test counts and fail-then-pass evidence

- Red run, after the four helper tests and before the helper existed: `node --test test/thumb-index-logic.test.js` — 4 tests, 0 passed, 4 failed. Each named test failed because its new exported function was absent.
- A later red run for the unknown-id allow-list: the same command — 5 tests, 4 passed, 1 failed because `sectionIconId` was not implemented yet.
- Focused helper green run after both implementation steps: the same command — 5 passed, 0 failed.
- Stage 4 pure-helper run: `node --test test/thumb-index-logic.test.js test/reading-logic.test.js test/curl-geometry.test.js` — 31 passed, 0 failed.
- Full run: `npm test` — 241 passed, 0 failed, 16 suites.
- `node --check` passed for `public/app.js`, `public/thumb-index-logic.js` and `public/reading-logic.js`; `git diff --check` passed.

### How the strip and page curl share the right edge

The strip is a 36 px layer at the paper sheet's right edge, above curl layers 2–5 at z-index 6. Briefing and curl-ghost content use a 38 px right gutter on phones and tablets, and the existing 40 px desktop gutter, so resting icons do not cover copy. Only the strip captures strip-originated pointers; the curl listeners remain on the briefing and reader pages, and forward curls still require a story-originated left drag. As soon as a curl direction locks, `curl-active` hides the strip; `reader-active` also hides it and makes the layer inert until the briefing returns.

### Deviations from the prototype and why

- The demo phone frame, explanatory hint, slow-motion control and left-handed control were not brought into the app. They are prototype scaffolding, and item 8 explicitly defers left-handed placement with no Settings toggle in this stage.
- Icons are created with SVG DOM methods instead of the prototype's trusted `innerHTML` strings. Their paths and attributes are unchanged, but this keeps article HTML as the frontend's only data-backed parsing boundary.
- The 30–92% positions use the real reading stage's height rather than the prototype phone frame's height, because the production masthead is a separate fixed sibling and the stage is the briefing's actual scroll viewport.

### Could not verify without a browser

No browser automation, jsdom or manual browser run was used. Pure tests do not verify visual icon/pill placement, spring feel, short-glide tracking, story hit-testing after live layout changes, native touch scrolling beside the strip, pointer capture, vibration support, keyboard focus appearance, screen-reader slider announcements, broadsheet edge placement, dark/light/Auto rendering, reduced-motion presentation, or the precise visual hand-off between the index and page curl. Those remain dev-container browser checks.
