# Job 2 report — reading screen

## What changed

### Task 8 — broadsheet desktop

- `public/app.js` now renders full-width section bands. Consecutive ordinary sections with at most six stories are wrapped into a shared band, while each section remains a real, addressable `<section>` for the thumb index.
- `public/style.css` makes the Paper fill desktop viewports with 40–56 px side margins and uses 3 columns from 1024 px, 4 from 1360 px, and 5 from 1900 px. Tablet uses 2 columns. Ordinary stories flow through balanced CSS columns with `break-inside: avoid`.
- The lead occupies two desktop columns. It shows its picture above the headline; without a picture it shows the full How it was told panel beside the copy, or uses a larger headline and a two-column summary when no panel exists.
- `public/thumb-index-logic.js` and `public/app.js` add a trophy-style Sport icon. Sport remains an ordinary section id, so thumb navigation and page-curl story picking use the existing paths.
- `public/edition-layout.js` supplies the pure viewport, band-pairing, column-balancing and content-selection decisions. `public/index.html` loads it before `app.js`, and `public/sw.js` precaches it under a bumped cache version for offline starts.

### Task 9 — pictures

- `public/app.js` and `public/style.css` show the lead image at every width and the first image-bearing story in each ordinary section from 700 px upward. Front-page frames reserve a 16:9 area and images lazy-load.
- The reader uses `images` plus the legacy `image` fallback, removes duplicate URLs, and stacks every image at the top. Each image opens full-size in a new tab. The first loads eagerly and later images lazily.
- `.codex-tmp/briefing-2026-10-15-reading-screen.json` is the requested uncommitted development copy. It gives Reddit rack story `s6` two images and `image_described: true`, and moves `s13`, `s42` and `s60` into a Sport section after Gaming.

### Task 10 — How it was told

- `public/app.js` renders the reader panel directly below the summary: outlet count, subjects, Leans against / Plain / Leans toward groups, quoted evidence, and each outlet's headline. An outlets-only result says “Told much the same way.”
- Front-page stories show “Told differently · N outlets” only when `told.differs` is true. A pictureless desktop lead can show the full panel in its spare column.
- `public/style.css` uses only existing Paper theme tokens, so light, dark and automatic Paper themes share the same panel and mark styling.
- The development copy adds the requested Steele-John example to `s1` and the outlets-only jobless-rate example to `s2`.

### Pure logic and tests

- `test/edition-layout.test.js` covers exact viewport decisions, short-section pairing, front-page picture selection, reader image deduplication/fallback, stance grouping, outlets-only panels and computed column balance.
- `test/thumb-index-logic.test.js` now requires Sport to retain its own icon id.

## Tests

- Failing-first evidence: before `public/edition-layout.js` and Sport support existed, `node --test test/edition-layout.test.js test/thumb-index-logic.test.js` ran 14 tests with 4 passing and 10 failing. The nine new layout/data tests failed because their functions did not exist; the icon test failed because `sport` mapped to `top`.
- Focused final run: `node --test test/edition-layout.test.js test/reading-logic.test.js test/thumb-index-logic.test.js test/curl-geometry.test.js` — 41 passed, 0 failed.
- Syntax and whitespace: `node --check` passed for `public/app.js` and `public/edition-layout.js`; `git diff --check` passed for all Job 2 files.
- Full `npm test` snapshot: 281 tests, 245 passed and 36 failed. Every failure is in the simultaneously edited Job 1 pipeline/settings surface (`src/` and its existing expectations); no reading-screen, layout, thumb-index or curl test failed. These are the parallel-job failures permitted by the task instructions.

## Measurements per width

No runnable headless browser was available, so no visual/browser measurement was made. `playwright-core` is present, but all three configured Chromium, Firefox and WebKit executable paths are missing; Puppeteer is absent. The figures below are computed estimates from `layoutForWidth`, `planSectionBands` and `balanceColumnHeights` against `.codex-tmp/briefing-2026-10-15-reading-screen.json`. Story heights are estimated from text length, the actual calculated column width, and reserved 16:9 picture height. Blank-space arrays are in visual-column order; the parenthesised number is the blank space beneath the shortest column in that band. Actual font metrics can change these estimates.

### 390 px

Paper: 390 px; side margins: 0 px; columns: 1; approximate content column: 336 px.

| Band | Blank below columns (px) | Shortest-column blank |
|---|---:|---:|
| You should know | `[0]` | 0 |
| Tasmania | `[0]` | 0 |
| Australia | `[0]` | 0 |
| World | `[0]` | 0 |
| Tech & Security | `[0]` | 0 |
| Homelab & Self-hosting | `[0]` | 0 |
| Gaming + Sport | `[0]` | 0 |
| Around the internet | `[0]` | 0 |

### 820 px

Paper: 820 px; side margins: 0 px; columns: 2; approximate content column: 363 px.

| Band | Blank below columns (px) | Shortest-column blank |
|---|---:|---:|
| You should know | `[16, 0]` | 16 |
| Tasmania | `[48, 0]` | 48 |
| Australia | `[0, 69]` | 69 |
| World | `[0, 132]` | 132 |
| Tech & Security | `[0, 31]` | 31 |
| Homelab & Self-hosting | `[110, 0]` | 110 |
| Gaming + Sport | `[0, 756]` | 756 |
| Around the internet | `[0, 115]` | 115 |

### 1280 px

Paper: 1200 px; side margins: 40 px; columns: 3; approximate content column: 354.7 px.

| Band | Blank below columns (px) | Shortest-column blank |
|---|---:|---:|
| You should know | `[172, 172, 0]` | 172 |
| Tasmania | `[0, 170, 90]` | 170 |
| Australia | `[77, 0, 141]` | 141 |
| World | `[87, 0, 169]` | 169 |
| Tech & Security | `[175, 41, 0]` | 175 |
| Homelab & Self-hosting | `[0, 8, 28]` | 28 |
| Gaming + Sport | `[218, 0, 399, 639]` | 639 |
| Around the internet | `[21, 15, 0]` | 21 |

### 1920 px

Paper: 1808 px; side margins: 56 px; columns: 5; approximate content column: 323.2 px.

| Band | Blank below columns (px) | Shortest-column blank |
|---|---:|---:|
| You should know | `[0, 0, 173, 374, 339]` | 374 |
| Tasmania | `[173, 141, 121, 3, 0]` | 173 |
| Australia | `[53, 108, 23, 0, 209]` | 209 |
| World | `[0, 182, 194, 41, 141]` | 194 |
| Tech & Security | `[0, 30, 30, 12, 110]` | 110 |
| Homelab & Self-hosting | `[9, 0, 162, 20, 20]` | 162 |
| Gaming + Sport | `[0, 180, 204, 423, 383, 422]` | 423 |
| Around the internet | `[101, 160, 70, 0, 39]` | 160 |

## Anything that departs from the plan and why

- Browser measurements were not possible because the environment contains no headless browser. The estimates above are plainly marked and use the same pure decisions as the renderer.
- A shared band uses `ceil(total columns / 2)` columns inside each half. This means 2/2 internal columns at a three-column viewport and 3/3 at a five-column viewport. Rounding upward keeps the effective story column width below roughly 360 px; rounding downward would create overly wide columns in half-width sections.
- The uncommitted development copy uses the available saved URLs and hand-written headlines/stances; it is test data for the reading screen, not pipeline output.

## Anything Jesse would notice on his phone

- The lead now has a reserved 16:9 picture above its kicker/headline when an image exists.
- Stories with genuinely different treatment show the small grey “Told differently · N outlets” line under the kicker.
- Opening a story with `told` shows the new How it was told panel beneath its summary.
- Opening a photo post shows every supplied image in a vertical stack, and tapping one opens the full-size image.
- The approved single-column front-page structure, complete story lists, thumb index and page-curl interaction are otherwise unchanged.
