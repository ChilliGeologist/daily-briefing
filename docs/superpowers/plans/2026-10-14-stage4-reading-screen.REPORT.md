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
