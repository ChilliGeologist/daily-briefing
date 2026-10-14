# Stage 4 — The reading screen — Implementation Plan

> **For agentic workers:** this plan is executed by Codex, dispatched from
> Claude Code. Steps use checkbox (`- [ ]`) syntax for tracking. Codex cannot
> commit (its sandbox holds `.git` read-only); Claude commits after the run.

## Decisions from Jesse

1. **Dark mode (answered 2026-10-14):** "yeah build one, but I want a
   dark/light/system/auto switch". Build the warm charcoal Paper look proposed
   below, and offer four theme choices: Light, Dark, System (follow the
   phone's setting) and Auto (dark from sunset to sunrise at home). See Task 7.

**Goal:** Replace the current card-based briefing with the approved Paper
reading experience. On a phone it opens with "You should know", followed by
the topic sections and their best four or five stories; a "More" control
reveals the remaining stories in place. A tap unfolds one story at a time.
"Read in full" shows the stored article in a clean reader, and a left swipe
turns the briefing over to the same reader with the approved newspaper curl;
a right swipe, the on-screen Back control, or the browser Back button returns
to the briefing.

**Architecture:** Keep the existing SPA and its router. Replace only the `/`
reading view with a layered reading stage: reader underneath, briefing page
above it, two shadow layers, and a mirrored flap above both. `public/app.js`
continues to fetch data and build accessible DOM nodes. Put section
partitioning and gesture decisions in `public/reading-logic.js`, and the
approved fold maths in `public/curl-geometry.js`; each is a dependency-free
classic browser script that also exports through CommonJS so `node:test` can
exercise it directly. Status, Settings and Archive remain the existing sibling
views and keep their route handlers and content code.

**Tech Stack:** Node 22, vanilla browser JavaScript, classic `<script>` tags,
CSS, CommonJS-compatible pure helpers, and `node:test`. No framework, build
step, browser-test runner or new npm dependency.

**Spec:** `docs/superpowers/specs/2026-10-13-overhaul-design.md`, the "For
Jesse" sections "How it looks" and "How it moves", and "Reading screen
(stage 4)". Visual and motion references are the approved `look.html`,
`paper-labels.html`, `motion.html`, and especially `page-curl.html`, copied
into `docs/superpowers/mockups/stage4/`; the last one is the source of truth
for fold geometry and lighting.

## Global Constraints

- Phone first at 360–430 px, then tablet and desktop. The article column stays
  comfortably readable rather than becoming a multi-column desktop layout.
- The reading view uses the approved Paper language: cream sheet,
  Georgia/Times-style serif body, dark ink, rust section labels and actions,
  quiet grey one- or two-word kickers. Do not restore cards, coloured category
  chips, significance rails or section icon tiles on this route.
- Preserve the existing Status, Settings and Archive routes, loaders,
  controls, theme setting and close/back behaviour. Scope new reading styles
  under a reading-route class or attribute so stage 4 does not restyle those
  screens; their visual overhaul belongs to stage 8.
- Use the stage 3 briefing shape as-is: section `{ id, title, items, more }`
  and story `{ id, title, kicker, summary, detail, image, sources,
  canonical_url, article_url, article_html, coverage, interest_labels }`.
  Do not change pipeline, database or API code for this stage.
- Since the stage 3 tuning (2026-10-14), `kicker`, `summary` and `detail` may
  be empty strings by design: a story whose outlet blocks reading (the Mercury)
  is headline-only, and a meaningless kicker is blanked. Render no empty
  element, no stray separator and no blank line for them. A headline-only story
  still expands, showing its source and the "Read in full" button; its reader
  shows the headline and "Open on <site>" with no empty body.
- "You should know" is always rendered first. Other sections show the ordered
  `items` list, capped at five defensively, and reveal overflow plus the
  ordered `more` list in place. Do not duplicate, re-rank or discard stories.
- Only one story may be expanded at once across the whole edition. A story
  remains a valid curl target whether it is compact or expanded.
- Stage 2 already sanitises `article_html` server-side to a small allow-list
  and strips scripts, forms, frames, inline handlers and unsafe links. Insert
  that one trusted field through a detached `<template>` and clone its
  `content`; do not assign any other briefing, story, source or settings value
  to `innerHTML`/`outerHTML` or an adjacent-HTML API. Continue to use
  `textContent`, DOM constructors and `safeUrl()` everywhere else.
- Do not try to defeat a paywall. Stage 2 prefers a non-paywalled source and
  stores only the copy the chosen site exposes. A missing body gets the story
  summary plus "Open on <site>"; a partial body is shown as-is with the same
  original-site link.
- Reuse the exact `page-curl.html` method: perpendicular-bisector crease,
  half-plane clipping, reflection across the crease, sine corner lift, faint
  reverse print, curl band, crease shadow and cast shadow. Do not replace it
  with a rotate, skew, slide, canvas library or newly invented fold.
- Pointer input uses `touch-action: pan-y`. Wait for 8 px of movement before
  choosing a direction, abandon the gesture when vertical movement wins, and
  call `preventDefault()` only after a horizontal curl is locked so ordinary
  vertical scrolling remains native.
- Complete a turn after one-third of the width or a horizontal flick; otherwise
  settle back. Use the approved mockup's `0.5 px/ms` flick threshold. A left
  swipe starts only on a story; a right swipe works anywhere on the reader.
- `prefers-reduced-motion: reduce` keeps the same navigation and thresholds but
  replaces the interactive/settling curl with a short opacity fade. Disable
  the expand slide too; content must not disappear or become delayed.
- The proposed dark Paper palette is a warm dark sheet rather than the
  rejected blue/black Night magazine design. The theme setting gains a fourth
  choice, Auto, alongside Light, Dark and System; System still follows the OS.
  Auto is dark from local sunset to sunrise at home (West Tamar, about
  41.30° S, 146.98° E), worked out in the browser with no location permission
  and no network. The choice applies app-wide, not only to the reading route.
- Pure frontend logic gets small `node:test` tests. Run only the named stage 4
  test files while developing this stage; do not use Playwright or claim that
  unit tests verified layout, scrolling, pointer feel or browser history.
  Jesse verifies those on the dev container with Task 8's numbered checklist.
- Australian English in labels and test fixtures. No network access is needed
  for unit tests.

## Review Focus

1. **The curl is the approved curl.** The grab corner is the nearer right-hand
   corner; the finger point, midpoint, normal, reflected flap and all three
   light bands use the constants and formulae from `page-curl.html`. Review
   Task 6 against that file side by side.
2. **Scrolling is never mistaken for a turn.** Movement below 8 px is
   undecided. A vertical-first gesture is released to native scrolling. A
   horizontal gesture captures the pointer only after it has selected a valid
   forward or backward direction.
3. **History has one entry per opened story.** Tapping "Read in full" or
   completing a left swipe adds one reader entry. Falling back adds none.
   Back, right-swipe completion and browser Back all return to the same edition
   and scroll position without fetching or rendering it again.
4. **Article HTML has one narrow trust boundary.** Only the already sanitised
   `article_html` passes through a template. Headlines, kickers, summaries,
   details, source names, URLs and the curl ghost never pass through HTML
   string construction.
5. **The briefing remains complete.** The first four or five ordered section
   items stay visible, `more` is initially hidden, and one activation reveals
   every remaining item without reordering it. "You should know" remains first
   even if a legacy payload lists it later.
6. **Other screens are unchanged.** `/settings`, `/archive` and `/pipeline`
   still enter, load, close and respond to browser history exactly as before.
   Reading-only colours and layout must not leak into them.
7. **Old and incomplete editions degrade cleanly.** Missing `kicker`, `detail`,
   `image`, `sources`, `article_html` or original URL must not throw. No body
   shows the summary; no valid original URL simply omits the external link.

---

### Task 1: Pure section, gesture and curl helpers

**Files:** create `public/reading-logic.js`,
`public/curl-geometry.js`; tests `test/reading-logic.test.js`,
`test/curl-geometry.test.js`.

- [ ] Wrap each helper file in a tiny universal export: assign its frozen API
  to a named `window` global in a browser and to `module.exports` under Node.
  It must not read `window`, `document`, layout, time or storage while the
  factory is being evaluated.
- [ ] `prepareSections(sections, visibleLimit = 5)` returns new objects in
  display order with `top` first, then every other input section in its
  existing order. Each result has `{ section, shown, hidden }`: `shown` is the
  first at-most-five `items`; `hidden` is excess `items` followed by `more`.
  Remove repeated story ids by first occurrence, retain id-less legacy items,
  do not mutate the payload, and do not impose the five-item cap on `top`.
- [ ] `decideGesture({ dx, dy, side, startedOnStory, threshold = 8 })` returns
  exactly `'wait'`, `'vertical'`, `'forward'`, `'back'` or `'ignore'`.
  `side` is `'briefing'` or `'reader'`: only leftward horizontal movement from
  a briefing story is forward, only rightward movement on the reader is back,
  and vertical wins when `abs(dy) > abs(dx)` after the threshold.
- [ ] `settleGesture({ direction, progress, velocityX })` returns the endpoint
  `0` (briefing) or `1` (reader): forward completes when `progress > 0.33` or
  `velocityX < -0.5`; back completes when `progress < 0.67` or
  `velocityX > 0.5`. Clamp out-of-range progress before deciding.
- [ ] `nearestCorner(pointerY, height)` returns bottom/right with sign `1`
  below the midpoint and top/right with sign `-1` at or above it, matching the
  approved mockup.
- [ ] `clipHalf(width, height, midpoint, normal, keepPositive)` clips the page
  rectangle with the same four-edge half-plane intersection as the mockup.
  `curlFrame({ width, height, progress, cornerY, sign, dragY })` returns the
  finger point, crease midpoint and unit normal, crease direction/angle,
  clipped front/flap polygons, reflection matrix/translation, fold width and
  lighting strengths/widths. It returns data only and never writes styles.
- [ ] Test complete values for top-first ordering, a four-item section, a
  seven-item section, pre-existing `more`, duplicate ids, id-less legacy
  stories and immutability. Test every direction-lock boundary at 7.99 px,
  8 px and just over 8 px, vertical cancellation, wrong directions, both
  one-third thresholds and both flick thresholds.
- [ ] Test `clipHalf` against simple known rectangles. For `curlFrame`, test
  the approved midpoint and sine-lift formulae, unit normal, front/flap
  complementary sides, reflection mapping the grab corner to the finger point,
  points on the crease staying fixed, and the exact light/shadow constants.
  Use a small numeric tolerance only for floating-point geometry.

### Task 2: Build the layered reading-stage shell without changing panels

**Files:** modify `public/index.html`, `public/app.js`.

- [ ] Load `reading-logic.js` and `curl-geometry.js` before `app.js`; keep
  classic scripts and the existing no-build startup.
- [ ] Replace only the current reading `main` with a `#reading-stage` route
  view containing, in the approved stacking order: `#reader-page`; a reader
  shadow layer and band; `#briefing-page` containing `#sections-container`;
  a front crease-shadow layer and band; and `#curl-flap` containing an
  inert, `aria-hidden` ghost plus the curl-light band. Retain the existing
  loading and empty states inside the briefing page.
- [ ] Give the reader a real Back button, story header container and article
  body container. Keep them empty and `inert` while the briefing is active.
  The curl layers are presentational, have no focusable children and never
  accept pointer events.
- [ ] Keep the existing masthead/navigation buttons, three panels, settings
  template and their ids in place. Keep `#sections-container` as the target
  used by `loadBriefing`; do not rename panel elements or settings controls.
- [ ] Change only the `/` route's `viewId` from `sections-container` to
  `reading-stage`. Add a route marker such as `data-view="reading"` to the app
  root during router rendering so CSS can scope Paper styles. Do not change
  the three panel route keys, `onEnter` loaders or pipeline cleanup.
- [ ] Add `resetReadingStage()` for edition changes and route exits. It cancels
  an animation/gesture, restores progress `0`, clears reader and ghost content,
  makes the briefing interactive, and preserves the existing panel lifecycle.

### Task 3: Render the Paper briefing and its complete section lists

**Files:** modify `public/app.js`, `public/style.css`.

- [ ] Feed `briefing.sections` through `prepareSections()`. Render "You should
  know" first, omit genuinely empty sections, then keep server order for the
  seven topic sections. A legacy section without an id gets the existing
  title-derived fallback id.
- [ ] Render a section as a rust, uppercase newspaper label followed by a
  ruled list. Remove the reading route's icon tile, item count, collapsible
  section header and significance bar. Do not delete the shared icon code
  that Status or Settings may still use.
- [ ] Render each compact story with its quiet grey `kicker` when present,
  serif headline and one-sentence summary. Give the first "You should know"
  story the approved lead type scale; it still behaves like every other
  story. Do not show list thumbnails—the approved Paper list has none—but
  retain `image` for the reader view.
- [ ] Build every story from DOM methods and `textContent`. Use stable story
  ids for `data-story-id` and control relationships, with a generated
  per-render fallback only when old data has no id. Store the item object in
  an in-memory map rather than serialising it into attributes.
- [ ] Keep the configured app title, falling back to "The Daily Gump", and
  render the edition date in the centred, letter-spaced masthead line. The
  current aggregate `briefing.headline` remains in data but is not repeated
  between the masthead and "You should know" on the reading route.
- [ ] Do not delete old `read-<date>` local-storage values, but stop using read
  opacity, read counts and "Mark unread" in the new screen. Stage 7 replaces
  that local presentation with deliberate reading events.

### Task 4: Add one-at-a-time expansion and in-place More controls

**Files:** modify `public/app.js`, `public/style.css`.

- [ ] Make the kicker/headline/summary area a full-width story toggle with
  `aria-expanded` and `aria-controls`. Use one delegated click handler on the
  briefing page: opening a story closes the previously open story anywhere in
  the edition; activating the open story closes it.
- [ ] Put detail, source names, reading time and "Read in full" inside the
  expansion region. Use the approved `grid-template-rows: 0fr` to `1fr`
  transition with an overflow wrapper, plus the inner opacity and `-6px`
  slide. Do not measure content height or use a fixed `max-height` guess.
- [ ] Render "Read in full" as a real button. It stops story-toggle handling,
  opens the same item in the reader, and remains available when article HTML
  is empty so the fallback reader can show summary and original-site link.
- [ ] When `hidden` has items, add a rust text button after the shown stories:
  `More (N)` / `Show less`, with `aria-expanded` and a labelled target. The
  first activation appends/reveals every hidden story in original order in
  the same section; it never refetches. On collapse, close an expanded hidden
  story first and return focus to the More button if focus was inside content
  being hidden.
- [ ] Ensure story toggles, More, Read in full and Back all have visible
  keyboard focus and work with Enter/Space through native button behaviour.
  Preserve the current edition scroll position while expanding, revealing or
  visiting the reader.

### Task 5: Render full articles safely and connect reader history

**Files:** modify `public/app.js`.

- [ ] Add `renderReader(item)`. It creates kicker, title, source/byline and
  reading-time text with DOM methods; shows `item.image` as an optional hero
  only after `safeUrl()` accepts it; and derives the original URL in order
  from `article_url`, `canonical_url`, then the first safe source URL.
- [ ] For non-empty `article_html`, create a detached `<template>`, assign only
  this server-sanitised field to `template.innerHTML`, and append a clone of
  `template.content` to the reader body. Add a code comment naming stage 2's
  sanitisation as the reason this single HTML boundary is allowed.
- [ ] If the template has no meaningful text or image, render `item.summary`
  as plain text instead. Always append `Open on <site> ›` when there is a safe
  original URL; derive `<site>` from the first source name, then URL hostname,
  then "original site". Use `target="_blank"` and
  `rel="noopener noreferrer"`.
- [ ] Treat a partial paywall extraction as the complete available body: show
  it, then the original-site link. Do not label it as complete, fetch more on
  the client or infer a paywall from article wording.
- [ ] Opening through the button, or after a forward curl commits, pushes one
  same-origin URL such as `/?story=<encoded id>` with history state identifying
  the current edition/story. It must not add a second entry when the same
  reader is already open.
- [ ] Extend `popstate` handling without adding a new panel route: when the
  story query/state disappears, animate or fade back to the briefing; when it
  appears after the briefing has loaded, find the story in the in-memory map
  and show it. A direct or stale story URL that cannot be resolved replaces
  the URL with `/` and shows the edition rather than leaving a blank layer.
- [ ] Back button and Escape call `history.back()` for an app-created reader
  entry; after a direct reader load with no app entry, replace the URL with `/`
  and close locally so Back does not unexpectedly leave the app. A completed
  right-swipe performs the same action only after its return animation ends.
- [ ] On entry set reader scroll to the top, make the briefing `inert`, expose
  the reader to assistive technology and focus its Back button or heading. On
  return reverse those states, restore briefing scroll and focus the story
  that opened it.

### Task 6: Implement the approved interactive page curl

**Files:** modify `public/app.js`, `public/style.css`; tests already added in
Task 1.

- [ ] Keep curl state `{ progress, cornerY, sign, dragY, animation }`, with
  `0` as flat briefing and `1` as fully turned reader. At endpoints remove
  stale clips/shadows and hide the flap exactly as the mockup does.
- [ ] On each frame use the pure helper with the approved equations. For page
  width `W`, height `H`, progress `p`, grab corner `A = [W, cornerY]`, vertical
  drift `dragY = 0.6 × (currentY - startY)`, and
  `lift = 90 × sin(πp)`, the finger point is
  `P = [W - 2Wp, cornerY + dragY - sign × lift]`. The crease passes through
  midpoint `M = (A + P) / 2` with normal `(A - P) / |A - P|`.
- [ ] Clip the front to the negative half of that crease. Clip the cut-off
  piece to the positive half and mirror it across the crease with
  `R = 2uuᵀ - I`, where `u` runs along the crease, including the midpoint-based
  translation from the mockup. Keep the flap's faint reverse print at opacity
  `0.09` and synchronise its scroll position with the briefing.
- [ ] Build the ghost by cloning DOM nodes, not by copying an HTML string.
  Remove ids and form/navigation behaviour from the clone, mark it inert and
  hidden from assistive technology, and refresh it when the edition, expansion
  or More state changes so the back of the sheet resembles the visible front.
- [ ] Reproduce the three approved light bands. Fold width is
  `max(20, |A-P| / 2)`. The flap band runs from brown `0.28` at the crease,
  through white `0.55` at `0.18 × foldWidth`, white `0.12` at `0.45 ×`, brown
  `0.10` at `1 ×`, to brown `0.18` at `1.6 ×`. The front crease shadow is
  `0.22 × min(1, 4p)` fading across `min(36, 0.5 × foldWidth)`. The reader cast
  shadow is `0.45 × (1-p)` fading across `30 + 50 × (1-p)` pixels.
- [ ] Bind pointer down/move/up/cancel to briefing and reader. Ask
  `decideGesture()` only after 8 px; do not capture or prevent the pointer while
  it returns `wait` or `vertical`. Once locked, capture it, populate the reader
  for forward motion, calculate velocity from the last sample, and set
  progress from horizontal displacement divided by page width.
- [ ] On release use `settleGesture()`. A failed forward turn returns to `0`
  and creates no history; a completed one reaches `1` then pushes reader
  history. A failed back turn returns to `1`; a completed one reaches `0` then
  performs the history return. Suppress the synthetic click after a moved
  pointer so a swipe cannot also toggle the story.
- [ ] Use the approved settling animation:
  `duration = max(200, 700 × abs(target - start))` milliseconds and ease
  `1 - (1-t)^3`; ease `dragY` back to zero during it. "Read in full" and Back
  use the same animation with a programmatic grab at 80% of page height.
- [ ] Re-render safely on stage resize/orientation change and cancel an active
  gesture if its target disappears. Do not keep a stale clip polygon after an
  edition load or panel navigation.
- [ ] Under reduced motion, keep direction locking and release decisions but
  do not render or animate fold geometry. Use one short cross-fade (about
  120–160 ms) for completed button, history and swipe navigation; a rejected
  swipe leaves the current page unchanged.

### Task 7: Finish responsive Paper styling, themes and article typography

**Files:** modify `public/style.css`, `public/app.js` (theme colour update only
if needed).

- [ ] Define reading-only Paper tokens. Light values start from the approved
  mockups: page `#f7f3ea`, reader `#fbf8f1`, ink `#1d1a16`, summary
  `#57514a`, quiet text `#8a8174`, rule `#d6cfc0`, rust `#9a3412`.
  Do not replace the existing panel tokens.
- [ ] Define the dark Paper values (approved by Jesse 2026-10-14) as warm
  charcoal page/reader surfaces, warm off-white ink, taupe quiet text/rules
  and a lighter accessible rust. Keep the same serif hierarchy and restrained
  rules—do not switch to the Night magazine's sans serif, numbering or yellow
  accent. Verify text, muted text, rust actions and focus rings meet WCAG AA.
- [ ] At 360–430 px use roughly the approved 16–18 px page gutters, 28 px
  masthead, 22 px lead headline, 16–17 px normal headline, 13–15 px summary/
  detail and generous 44 px action targets. Include safe-area insets for an
  installed phone app and prevent long words/URLs from widening the page.
- [ ] On tablet and desktop centre the paper and reader at the existing
  approximately 800 px maximum, give the article body a roughly 65-character
  measure, and let the surrounding background frame the sheet. Do not stretch
  story rules or curl geometry beyond the actual paper bounds.
- [ ] Style sanitised article elements (`h2`–`h4`, paragraphs, lists,
  blockquotes, figures, captions, links and responsive images) in the same
  paper typography. Images are `max-width: 100%`, auto height and cannot cover
  controls; broken optional hero images remove themselves.
- [ ] Use `100dvh` with a sensible `100vh` fallback for the layered stage,
  native momentum scrolling for briefing and reader, and `overscroll-behavior`
  only where it prevents the two layers from chaining without blocking normal
  article scroll.
- [ ] Add clear hover only for mouse-capable devices, visible `:focus-visible`
  treatment, and reduced-motion overrides for expansion, curl and fades. Test
  at 200% zoom and ensure buttons and headings do not overlap.
- [ ] If `applyTheme()` updates the browser's theme-colour meta tag, use the
  active Paper background on `/` and retain the existing app background on the
  three panel routes.
- [ ] Add the **Auto** theme. Settings → Theme gets a fourth button (order:
  Auto, System, Light, Dark; a small sun-and-moon icon in the existing icon
  style). Stored value `auto` in the existing `theme` localStorage key; unknown
  stored values fall back to `system`, and existing `system`/`light`/`dark`
  values keep working. Put the sun maths in a pure module (for example
  `public/sun-times.js`) using the NOAA sunrise/sunset equations for the fixed
  home coordinates, returning the day's sunrise and sunset as Dates. Auto sets
  `data-theme="dark"` between sunset and sunrise, else `light`. Re-evaluate on
  `visibilitychange`, on page load, and with one timer set for the next
  sunrise/sunset (not polling); clear the timer when the user picks another
  theme. Unit tests: sunrise and sunset in Launceston on 21 June, 21 December
  and a daylight-saving changeover day, each within 3 minutes of published
  times (cite the source in the test), and Auto's dark/light decision either
  side of each boundary.

### Task 8: Jesse's dev-container verification (Claude, not Playwright)

**Files:** no product files; record results in the stage report.

- [ ] Claude deploys the stage to the dev container. Claude does not run or
  write Playwright/browser automation; Jesse performs this numbered check:

  1. At 360, 390 and 430 px wide, confirm cream Paper opens with "You should
     know" first, then the topic sections; each topic shows its best four or
     five stories and `More (N)` reveals the rest in order without a reload.
  2. Tap several compact and already-open stories. Confirm detail unfolds in
     place, only one story stays open, and Show less does not strand focus or
     leave an invisible open story.
  3. Use "Read in full" on a story with an article. Confirm headline, source,
     optional image and the publisher's clean article appear in the same type,
     long articles scroll, and "Open on <site>" opens the original in a new
     tab.
  4. Open a story with no extracted article and one from a paywalled source.
     Confirm there is no blank reader or attempted bypass: available copy or
     the briefing summary appears, followed by the original-site link.
  5. Slowly swipe left from both an open and compact story, once near the top
     and once near the bottom. Confirm the nearer corner lifts, the crease and
     reflected print follow the finger, and curl/crease/cast lighting matches
     the approved page-curl mockup.
  6. Swipe vertically on stories and in both long pages. Confirm scrolling is
     native and does not twitch sideways. Try a short horizontal drag under
     one third, a long drag over one third and a quick flick; confirm fallback
     and completion thresholds feel correct.
  7. From the reader, swipe right to return. Reopen and use the on-screen Back,
     then reopen and use browser Back. Confirm each returns to the same edition,
     scroll position and opening story, with no double history step.
  8. Enable reduced motion in the device/browser, repeat Read in full and both
     swipe directions, and confirm there is only a short fade—no fold, slide or
     delayed hidden content.
  9. Check Auto, System, Light and Dark. Confirm Light matches the approved
     cream mockup and Dark looks like warm dark paper with readable text rather
     than the rejected Night magazine. With Auto chosen, the page should be
     light by day and dark after sunset (Claude confirms the switch times from
     the unit tests; Jesse checks that it looks right in the evening).
  10. At tablet and desktop widths, and at 200% zoom, confirm the centred paper
      and article remain readable, images fit, keyboard focus is visible and
      every action works without horizontal scrolling.
  11. Open Status, Settings and Archive from the toolbar; exercise their close
      buttons and browser Back. Load an archived edition, return to its reading
      screen and open a story. Confirm those screens still load and behave as
      before and have not acquired Paper styling.

## Report

Write `docs/superpowers/plans/2026-10-14-stage4-reading-screen.REPORT.md`: per
task, what changed; the targeted `node --test test/reading-logic.test.js
test/curl-geometry.test.js` summary; any plan deviation and why; the browsers,
viewport widths, input methods and theme/reduced-motion modes Jesse checked;
the numbered result of every Task 8 item; and any remaining visual or motion
issue. Include no Playwright evidence.

---

## Follow-ups from Jesse's review (2026-10-14)

Jesse: "Looks and feels okay" on the phone; other functions work. Changes he
asked for, all part of stage 4:

1. **No More buttons.** Every section shows all its stories (`items` then
   `more`, in order). Remove the More/Show less control and its state.
2. **Desktop must not feel like a phone app on a computer.** This replaces
   the "single readable column" constraint for the briefing (the reader keeps
   its ~65-character measure). From about 1024 px the briefing becomes a
   broadsheet: "You should know" as a lead band (first story large across two
   thirds, the other picks stacked in the remaining third), then the topic
   sections flowing in three columns with rust labels and column rules; two
   columns from about 700 px; one column on phones as now. Expansion still
   unfolds in place inside its column. The curl still turns the whole sheet.
3. **A more newspaper-like masthead** (Jesse called it polish; done now because
   it is the same work as the desktop layout): "The Daily Gump" as a heavy,
   high-contrast serif title (system serif stack, no web fonts), thick-and-thin
   double rules above and below, and a small-caps edition line beneath with
   the long date. Scales down cleanly on phones.
4. **Read in full must never show less than the tap.** With no article body,
   the reader shows the story's `detail` (falling back to `summary`), never
   only the summary. For a Reddit or Hacker News story it shows the post's own
   text and its top replies ("What people said"), as plain text.
5. **A question post with no real answers is not news.** Pipeline change:
   ignore bot and moderator boilerplate replies (rules reminders, "Expand the
   replies to this comment to learn how AI was used…"); a community post whose
   title asks a question and that has fewer than two real replies is not news
   (seen: an r/OutOfTheLoop question whose only reply was the rules reminder).
   Showcases and announcements without replies stay. Add a filler default for
   standing "Discussion Thread" posts. Keep the post text and top replies on
   stored community stories so the reader can show them.
