# Stage 5 — Previous editions

Written 2026-10-25, after stage 4 merged (pull request 5). Design source:
`docs/superpowers/specs/2026-10-13-overhaul-design.md` on branch
`docs/overhaul-design`, section "Previous editions (stage 5)".

---

## For Jesse: what you'll get

The archive button opens **Previous editions**, in the same newspaper look as
the briefing.

- **Every edition, newest first**, grouped under month headings ("October
  2026"). Each one shows its day and date, its top headline and how many
  stories it had. Today's is marked.
- **Tap an edition** and it opens in the normal reading screen, with its own
  date under the title. A plain line at the top says it is an older edition,
  with a way back to today's.
- **A search box at the top** looks through every story ever kept: headlines,
  summaries, the topic word above each headline, outlet names, and (for
  editions from the new writer onwards) the full article text. "plex" also
  finds "Plex's"; several words find stories that mention all of them.
- **Results are grouped by edition**, newest first: a date heading, then the
  matching stories from that day, each with its headline and a line of text
  with your words in bold. Tap one and it opens that story directly. Back
  takes you to your results with the search still there.
- **Older editions** (from before the overhaul — 25 March to now on your live
  copy, 211 of them, about 11,700 stories) open in the new look too. They
  have no full article saved, so the story page shows their summary and the
  longer paragraph they were written with, and a link to the original.

Nothing already saved is changed or removed. Search works from a separate
index built alongside the editions; if it were ever lost it can be rebuilt
from them.

---

## Technical design

### Decision: an index beside the blob, not a new data model

The overhaul design proposed `editions` + `stories` tables replacing the
`briefings.data` JSON blob. Everything that reads editions (assembler output,
`/api/briefing`, the stage 4 reading screen, the offline cache) uses the
blob today, and new editions already carry `article_html` inside it. Stage 5
needs only search, so it adds a derived FTS5 index and leaves `briefings`
untouched. Lower risk for live data (prod holds 211 editions, 2026-03-25 →
today), no migration that rewrites rows. A move to per-story tables can
happen later if stage 7 (learning) needs story ids in SQL; nothing here
blocks it.

### Index

- `story_search` FTS5 virtual table, tokenizer
  `porter unicode61 remove_diacritics 2`. Columns: `title`, `kicker`,
  `summary`, `body` (old `detail`, or new `article_html` stripped to text,
  plus Reddit `description`/`top_comments` text), `outlets` (source names,
  short names), all searchable; plus UNINDEXED `briefing_id`, `story_key`
  (the same id the reading screen uses to open a story — check
  `readingStories`/`storyKey` logic in `public/app.js` and make the server
  use the identical rule, including the fallback for old items without `id`),
  `section`, `date`.
- Old `sources` values are sometimes a Python-repr string
  (`"[{'name': ...}]"`), not JSON. Parse both; never throw on a bad row —
  index what can be read and log the rest.
- Filled when a briefing is saved (same transaction as the insert), and
  backfilled at startup: any briefing id with no index rows gets indexed.
  Idempotent. Rebuild = delete the index and restart.
- Weighting: `bm25(story_search, 10, 4, 3, 1, 2)` (title highest).

### API

- `GET /api/briefings` — unchanged shape, plus `story_count` reliable for old
  rows (count from data if `item_count` is 0/null) and the top headline.
  Return all editions (drop the 365 cap only if needed; 211 rows is small).
- `GET /api/search?q=…&limit=…` — query string sanitised into an FTS5 query
  (split on whitespace, strip FTS syntax characters, each term as a quoted
  prefix: `"plex"*`; all terms ANDed). Empty/too-short query → 400 or empty.
  Returns `{ query, total, editions: [{ id, date, headline, stories:
  [{ key, title, kicker, section, snippet }] }] }`, editions newest first,
  stories within an edition by bm25. Snippet from `snippet()` over the best
  column, marks as `<mark>`… escaped server-side — or return plain text plus
  match ranges; never inject raw HTML from stored text. Cap total stories
  (default 100) and say so in `total`.

### Screen

- Replace the old archive panel's list with a Paper-look "Previous editions"
  view at the existing `/archive` route (keep the route; the button title
  becomes "Previous editions"). Phone first; comfortable at 700 px and
  broadsheet widths. Light and dark Paper themes. Uses the folding masthead
  like the reading screen if that is simple; otherwise the panel header in
  Paper type.
- Month headings, edition rows (weekday + date, top headline, "N stories"),
  today's marked. Load all rows; no pagination buttons.
- Search box at the top (type="search", debounced ~250 ms, Enter searches at
  once). Results replace the list while there is a query; clearing it brings
  the list back. Empty result: "Nothing found for "…"". Keep the query and
  scroll position when returning from a story or edition.
- Tapping an edition: loads it into the reading screen (`loadBriefing(id)`),
  URL carries the edition (e.g. `/?edition=<id>`) so reload and back work.
  An older edition shows a thin line under the masthead: "Edition of
  Thursday 15 October · Back to today".
- Tapping a search result: loads that edition and opens the story's reader
  directly (`openReaderById`), so back goes to the edition, and back again
  to the results.

### Old editions in the reading screen

Make sure a pre-overhaul edition renders well in the stage 4 screen: no
kicker (fine), `detail` shown in the reader when there is no
`article_html`, sources string parsed, `significance` ignored, no "told".
Test with real old rows (the dev DB holds prod's editions up to 13 Oct).

### Tests

- Index builder: real old item (Python-repr sources), real new item
  (article_html, told, Reddit comments), malformed row.
- Query sanitiser: punctuation, quotes, FTS operators typed by the user
  (`AND`, `NEAR`, `"`, `*`, `-`), unicode, empty.
- Story key: server rule equals client rule for old and new items.
- New tests must fail against the pre-change code; assert whole values.
