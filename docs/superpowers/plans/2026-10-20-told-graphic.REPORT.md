# How it was told — Option A report

Implemented Jesse's 2026-10-20 choice, Option A ("the scale"), as a frontend-only change. No `src/` files, containers, databases, services, dependencies, or external assets were changed by this work.

## What changed

- The reader's text stance groups are now one three-tick scale per subject, labelled Against, Plain, and For with the approved rust, quiet grey, and muted teal colours in both Paper themes.
- Outlet dots are interactive buttons. Selecting one adds a ring and updates a polite live quote box with the full outlet name(s), reader-facing stance, and quote. A plain stance with an empty quote reads "Reported it plainly."
- Matching stance/quote pairs merge into one dot. Labels are shortened, evenly distributed inside their stance band, and alternated onto a second row when their positions are less than 13 percentage points apart.
- The compact Headlines list remains below the scales. An outlets-only result has no empty scale and reads "Told much the same way."
- Differing front-page stories now show the 140px miniature scale and "Told differently · N outlets" under the kicker. The old full panel beside an unpictured desktop lead was removed.
- `public/told-scale.js` contains the pure placement logic, is loaded before the app, and is included in the bumped service-worker cache.

## What Jesse will see

On a phone, each reader scale runs across the available article width. Dots retain their short labels, crowded labels step down to a second line, and a tap reveals the outlet's exact words immediately below the scales. The Headlines list follows in the same compact form. On the front page, the mini scale and outlet count wrap cleanly as one small metadata row below the kicker.

On desktop, the same reader graphic gains more horizontal breathing room while keeping the dots and quote interaction identical. The front-page lead no longer opens a separate text-heavy told panel beside the story; it uses the same restrained mini-scale treatment as every other differing story.

Keyboard users can Tab to every dot and select it with Enter or Space. Each scale is an accessible group named for its subject, dot buttons announce outlet and stance, focus/selection is visibly ringed, and the quote result is `aria-live="polite"`. Reduced-motion preferences keep the interaction free of transitions.

## Verification

- Added failing-first pure-logic coverage for the Trump example: 7NEWS against; SMH and The Age merged as `SMH · Age`; SBS, Ars, and Reuters plain with staggered labels.
- Covered single against/plain centring, empty plain quotes, all shortening rules, and the full For band.
- `node --check public/app.js` — passed.
- `node --check public/told-scale.js` — passed.
- `git diff --check` — passed.
- `npm test` — 324 passed, 0 failed.

The worktree also contains concurrent pipeline and writer changes from the parallel Codex job; they were left untouched.
