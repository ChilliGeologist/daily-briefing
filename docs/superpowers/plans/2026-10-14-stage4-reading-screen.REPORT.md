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
