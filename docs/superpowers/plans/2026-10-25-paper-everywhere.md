# Paper everywhere — one look across the app

Written 2026-10-25 after stage 8. Jesse: "there's still a bit of a mish mash
of old and new themes". Branch `feat/paper-everywhere`, stacked on stage 8
(pull request 9).

## For Jesse: what you'll get

Every screen in the newspaper look, in light and dark:

- **Settings and Status** lose the old grey bar at the top and open like
  Previous editions does: a big serif heading with a close cross.
- **Status** is redone. The run steps become a quiet line of small words with
  ticks, not green circles. "Last paper: Saturday 24 October, 6:00am". The
  button becomes "Write a paper now" in the paper's rust colour. The long
  technical log is folded away under "Show the log". The urgent checks and
  learning panels stay as they are.
- Leftover blue buttons, navy dark mode and grey boxes anywhere else (pop-up
  messages, confirm boxes, the update notice, the alert page) move to the
  paper's colours.
- "7:00 Pm" becomes "7:00 pm".

## Audit (headless, 390 and 1280 px, light and dark)

- `/` reading: Paper. `/archive`: Paper, no app bar.
- `/settings`: Paper panel, but the old `#app > header` app bar (sans title,
  boxed icon buttons, grey band) shows above it.
- `/pipeline` (Status): old app bar; uppercase sans "STATUS"; green-circle
  step row with a blue rule; monospace log box always open; blue "Run Now";
  dark mode is the old navy/blue-black palette; "Work it out now" blue and
  "Forget all this" red-outlined buttons inside the Paper panel.
- Urgent checks time renders "7:00 Pm" (title-casing applied to a time).

## Technical design

- Use the archive view's header treatment for settings and pipeline views
  (find how `#app[data-view="archive"]` hides/replaces the app bar and reuse
  it). Close cross returns to the reading view as today.
- Status in Paper tokens: serif page heading like Previous editions; steps as
  inline small caps with ink ticks / rust for running / muted for pending
  (keep live updates from SSE); last run sentence in en-AU long date; button
  label "Write a paper now"; log in a `<details>` "Show the log", monospace
  kept inside it, Paper colours.
- Sweep for old tokens/classes: every remaining use of the pre-Paper palette
  (blue accents, navy dark backgrounds, grey cards) in style.css and inline
  styles in app.js — toasts, confirm dialogs, update/install banners, alert
  page, setup/offline states, buttons (`.btn-primary`, `.btn-danger`, …). Map
  to Paper tokens; destructive buttons use the rust/ink outline style
  already used by "Remove" in Settings.
- Time formatting: lower-case am/pm everywhere times are shown.
- No behaviour changes beyond labels named here.
- Tests: time formatting; any label contract tests updated. Headless pass at
  390/1280 light/dark over every view; report remaining non-Paper colours
  found by scanning computed styles for the old palette.
