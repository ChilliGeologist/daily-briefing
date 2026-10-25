# Stage 7 — Learning from what you open and skip

Written 2026-10-25, after Jesse confirmed stage 6. Design source:
`docs/superpowers/specs/2026-10-13-overhaul-design.md` (branch
`docs/overhaul-design`), "Learning (stage 7)". Branch `feat/stage7-learning`,
stacked on stage 6 (pull request 7).

---

## For Jesse: what you'll get

The paper starts noticing what you read.

- **What it notices:** each story you scroll past on today's paper (on screen
  for at least a second), each story you open, and each one you read most of.
  Nothing leaves the server; it is only used to order your paper.
- **What it changes:** once a week it works out which kinds of stories you open
  more or less than usual: by topic word (the grey word above a headline), by
  outlet and by section. Next morning those stories move a little up or down
  inside their section. The push is small: at most about a seventh of a story's
  score, so a big story never drops out because of it.
- **What it never changes:** your interest list still wins, and "You should
  know" is never picked because of this alone. It needs a fair amount of
  reading before it moves anything (about 20 stories of a kind), so the first
  couple of weeks will look the same as now.
- **What you can see:** a "What the paper has learned" panel on the Status
  page, in plain words: "You open Gaming stories more than most: nudged up a
  little." "You rarely open stories from Daily Telegraph: nudged down." It has
  a "Forget all this" button that clears it and starts again.

The dev copy will only learn from what you read on it, which is probably not
much. The real test of whether it helps comes after release, on your live copy.

---

## Technical design

### Recording

- Client (`public/app.js`): IntersectionObserver on story cards in the reading
  view of the **latest** edition only (not older editions from Previous
  editions). `seen` once per story per edition after ≥1 s at ≥50 % visible.
  `opened` when the reader opens the story (any path: tap, thumb slide-off,
  search result, alert). `read_full` when the reader page has been scrolled
  past ~75 % of its content or held open ≥45 s with some scrolling; once per
  story.
- Events queued in memory and in `localStorage` (try/catch; works without it),
  flushed in batches by `navigator.sendBeacon` / `fetch(keepalive)` to
  `POST /api/events` on visibilitychange/pagehide and every ~20 s. Offline:
  keep the queue, send later. Server dedupes on (briefing_id, story_key, kind).
- Table `story_events(briefing_id, story_key, kind, at)` with a unique key on
  the first three, plus the story's features copied at write time from the
  stored edition: `section`, `kicker` (lowercased), `outlets` (JSON of source
  names), `interest_labels`. Additive migration only.

### Learning

- Weekly job (Sunday 03:30 settings timezone) plus on demand from the Status
  panel: over the last 8 weeks, per feature value (kicker, outlet, section)
  compute open rate = opened / seen. Compare with the overall open rate using
  a shrunk estimate (e.g. add 10 pseudo-observations at the overall rate) so
  small samples stay near zero. Skip values with < 20 seen.
- Nudge per value = clamp((rate − overall) / overall × k, −0.15, +0.15)
  (choose k so a clearly different value reaches the cap). A cluster's total
  nudge = product of (1 + nudge) over its kicker, its best outlet and its
  section, then clamped again to ±15 %. Store the table `learned_nudges` with
  the computed values, sample sizes and the time computed.
- `read_full` counts as a stronger open (weight 1.5) in the rate.

### Ranking

- `rankClusters` applies the nudge to a cluster's score. Kicker is not known
  until the writer runs, so at rank time use outlet + section guess (the
  categoriser's section); the writer's section/kicker nudge applies when
  ordering stories inside a section at assemble time. Interest-list matches
  and the "You should know" choice ignore nudges: a story must qualify for "You
  should know" without its nudge; nudges may only reorder stories that already
  qualify.
- Log each run's applied nudges (top 10 by size) in the run log.

### Status panel

- "What the paper has learned": plain sentences for each non-zero nudge
  (largest first), sample counts in small grey, last computed time, "Work it
  out now" and "Forget all this" (clears events and nudges, with a confirm).
  Paper look, light and dark. Empty state: "Nothing yet. Read a few more
  papers and check back."

### Tests

- Event dedupe and validation; rate/shrinkage/clamp maths with whole values;
  nudges never change "You should know" eligibility; ranking order change on a
  real saved candidates fixture with a fixed nudge table. New tests fail
  against the pre-change code.
