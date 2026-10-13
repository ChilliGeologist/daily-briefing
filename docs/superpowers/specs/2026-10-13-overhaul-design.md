# The Daily Gump overhaul — design

Written 2026-10-13 from a design conversation with Jesse. The first part is for
him; everything under "Technical design" is for whoever builds it.

---

## For Jesse: what you'll get

**What it's for.** A briefing you read on your phone over breakfast. It opens
with a short **"You should know"** section, then topic sections you skim if
you have time. Five minutes is a good morning; more is there if you want it.

**What reaches the top.** The day's biggest news — what most outlets are
leading with — plus anything that touches you directly, from a list you keep:

- Where you live: West Tamar and Launceston first, then the state, then the
  country. Emergencies, fires, severe weather warnings, road closures, things
  on (festivals, shows, markets, sport — bigger ones count from further away),
  and politics at council, state and federal level, with a lift for whatever
  is the hot topic.
- Your server and network: security holes or serious bugs in what you run.
- Your power, money, shopping and games: Tasmanian electricity and solar
  news, Up Bank, interest rates, big Woolworths/Coles changes, major Dota 2
  and Old School RuneScape updates.

You edit that list on a settings screen whenever you like. Over time the app
also notices what you open and what you skip, and nudges its choices — but
your list and the day's big news always come first.

**The sections**, as a starting point: Tasmania (with What's on), Australia,
World, Tech & Security, Homelab & Self-hosting, Gaming, Around the internet.
Each shows its best four or five stories; "more" opens the rest.

**How it looks.** Like a good newspaper: serif type on a cream page. Above each
headline, one plain grey word for the topic ("Plex", "State politics",
"Basketball") — never a sentence explaining why it was picked.

**How it moves.**
- Tap a story and its summary unfolds in place.
- "Read in full" opens a clean copy of the article inside the app — the
  publisher's words without ads, pop-ups or sign-up boxes. Paywalled sites
  give only what they give away, then a link.
- Swipe left on any story, opened or not, and the page curls over like a
  sheet of newspaper, following your thumb, to that story's full copy. Swipe
  right to curl it back.

**Who writes it.** The app will be able to use either the free AI on your
server or a paid one from Anthropic. Before choosing, you'll see both write the
same morning's stories side by side, and I'll tell you what the paid one
would cost a month, measured on a real morning. Whichever you choose, if the
paid one is unreachable the free one takes over, so a briefing always arrives.

**Previous editions.** Every briefing is kept, and you can search them all
("that Plex thing last month").

**Notifications.** One each morning when the briefing is ready, showing the
top headline. And, during the day, an alert when something urgent touches
you — a serious hole in something you run, an emergency near home. At most
three a day, and none between 10pm and 6am unless it's an emergency near
home.

**How it gets built.** In eight stages, inside the existing app. After each
stage you get a list of things to check on the test copy, and the next stage
waits for your say-so:

1. Sources fixed *(built; waiting for your checks)*
2. Better raw material — full articles for every story, repeats caught,
   filler and old news dropped
3. The writer — new summaries and headlines, the "You should know" pick,
   both AIs side by side
4. The reading screen — the newspaper look, sections, curl
5. Previous editions with search
6. Notifications
7. Learning from what you open and skip
8. Settings tidy-up — your list, sources and sections, in the same look

**What you give up.** Reddit now allows only about one request a minute
without an account, so Reddit posts arrive slowly (fine at 4am) and without
upvote counts. A free Reddit app key would lift both limits; that's an
optional extra, not in these stages.

---

## Technical design

### Current state (measured 2026-10-13)

- Node 22, Express, better-sqlite3, vanilla JS SPA (`public/app.js` 2,400
  lines, `public/style.css` 1,600). Pipeline in `src/pipeline/`:
  collect → score → extract → dedup → categorise → summarise → assemble.
- Ollama on the Unraid host, GTX 1070 8 GB. Prod model `qwen3:8b`;
  `gemma4:latest` also pulled. One call per story, ~4.4 s each.
- **Score runs before extract and dedup** and caps to 60 items on headline
  data alone. SMH and The Age publish the same feed under two hosts, and
  the French-fridge story took four of the 60 slots on 2026-10-13 because the
  8B model refused the merge. Filler (weather reports, court lists, Superquiz,
  cartoons) and three-week-old Press Start items also took slots.
- Extract only ran for Reddit link posts (`external_url`); RSS items never
  had article text, so every summary came from title + teaser.
- Dev DB had no categories, so dev briefings land in "Other" (expected).

### Pipeline, new order

```
collect → normalise → filter → cluster → rank → extract → write → edit → assemble
```

1. **collect** — unchanged fetchers. Reddit via Atom feeds and the shared
   rate-limited queue (stage 1).
2. **normalise** — canonical URL (strip `utm_*`, `ref`, fragments), strip
   Google News' " - Publisher" title suffix, record each item's position in
   its source's list (1..n) as the engagement proxy the Reddit Atom feed
   lacks. Google News links are resolved to the publisher URL later, in
   extract, and only for selected stories: resolving costs two requests per
   link (article page for a signature, then Google's `batchexecute`
   `garturlreq` call), verified working 2026-10-13.
3. **filter** — drop items older than a cut-off (default 36 h; per-source
   override for slow sources). Drop filler by an editable list of title
   patterns (seeded: weather report for, magistrates court list, superquiz,
   best of cartoons, crossword, horoscope, as it happened).
   Every drop is logged with its reason so the Status page can show it.
   The "is this a news story?" AI check moves into the stage 3 writer, which
   already reads each selected story: running it on ~900 raw items a day
   would cost more than the whole write step.
4. **cluster** — group items reporting the same story. Pass 1: same
   canonical URL. Pass 2: same URL path across hosts (catches SMH/Age
   syndication). Pass 3: TF-IDF cosine similarity on title + teaser,
   thresholds tuned on a saved real day; pairs between the low and high
   threshold go to the local model for a yes/no, capped per run. Embeddings
   from a local Ollama model are the fallback if the saved day shows TF-IDF
   missing real repeats; they need a model pulled onto the AI host, which
   needs Jesse's say-so.
   A cluster carries all its source items; its **coverage** is the number of
   distinct outlets, with syndicated copies counting once.
5. **rank** — score clusters, not items:
   coverage (strongest signal for "biggest news"), recency, interest-list
   match, source weight, Reddit/HN position, and (stage 7) learned nudges.
   Keep the top ~120 clusters as candidates, with a per-section floor so
   Gaming and Homelab are not starved by national news.
6. **extract** — full article text for each candidate cluster's best
   source (prefer an unpaywalled outlet when the cluster has several).
   Readability text for the writer; sanitised Readability HTML stored for the
   reader view (strip scripts, iframes, forms, inline handlers; keep
   paragraphs, headings, lists, blockquotes, images). Up to 5 at once, 10 s
   timeout, browser User-Agent.
7. **write** — per cluster: headline (keep the publisher's unless it is
   vague, clickbait or misleading; never make it vaguer), one-sentence
   summary, a 60–120 word detail paragraph synthesising all sources, the
   one-word kicker, and the section (one of the seven). Australian English,
   no padding.
8. **edit** — one call over the whole day's written candidates picks
   "You should know" (5–7 items): biggest coverage first, then interest-list
   matches with real consequence. It also trims each section to its best 4–5
   and orders them.
9. **assemble** — stored as an edition (see data model).

### Writers

A `writer` interface with two backends, chosen in settings:

- `ollama` — current host. Test `gemma4` against `qwen3:8b` on a saved day.
  Structured JSON output via Ollama's `format` schema.
- `anthropic` — Claude API with structured output. Model chosen at stage 3
  (Haiku-class for writing; possibly a stronger model for the single `edit`
  call). API key in `/app/data` settings, never in the repo. Prompt caching
  for the fixed instructions.
- **Fallback:** an `anthropic` failure (network, 5xx, quota) falls back to
  `ollama` for the rest of that run and logs it.
- **Compare mode:** run both writers over the same saved candidate set and
  show the results side by side on a dev-only page, with token counts and a
  measured cost per edition. Jesse picks; the choice is a setting.

### Interest list

Settings table rows: `{label, kind: place|topic|product, terms[], weight,
urgent: bool}`. Seeded from the design conversation (places: West Tamar,
Launceston, northern Tasmania, Tasmania; topics: council/state/federal
politics, events, emergencies; products: Unraid, Plex, Sonarr, Radarr,
Home Assistant, UniFi, Tailscale, Authelia, Proton, Up Bank, Aurora Energy,
Woolworths, Coles, Dota 2, Old School RuneScape). Matching is term match
first, then the writer confirms relevance for the top section and alerts.
Place weight falls with distance: local > state > national.

### Data model

- `editions` replaces the `briefings` JSON blob going forward: one row per
  edition (date, created_at, writer used, stats).
- `stories`: one row per cluster in an edition — headline, kicker, summary,
  detail, section, rank, is_top, sources JSON, image, article_html,
  article_text, canonical_url.
- `stories_fts`: SQLite FTS5 over headline, summary, detail, article_text —
  powers Previous editions search.
- `reading_events` (stage 7): story_id, kind (`seen|opened|read_full`), at.
- Existing `briefings` rows stay readable: a one-off migration copies them
  into `editions`/`stories` without article text, and the old table is kept,
  not dropped. No data is lost (prod holds months of real briefings).

### Reading screen (stage 4)

Rewrite the reading side of the SPA; the Status and Settings pages keep
working and are restyled in stage 8.

- Phone first (360–430 px), comfortable on tablet and desktop.
- Paper look as approved in the mockups: cream page, Georgia-style serif,
  rust accent for section labels, grey one-word kicker.
- Expand in place: CSS grid-rows 0fr→1fr, fade/slide of the inner text,
  one story open at a time.
- Reader view: stored `article_html` in the same type. Paywall or empty
  extraction → summary plus "Open on <site>".
- **Page curl**: the approved mockup's method — the briefing page is clipped
  along a crease (perpendicular bisector of the grab corner and the finger
  point); the cut part is mirrored across the crease as the page back, with
  curl lighting, a crease shadow and a cast shadow on the reader page; the
  corner lifts along a sine of progress and the crease angles accordingly.
  Pointer events with `touch-action: pan-y`, so vertical scrolling stays
  native; direction is decided after 8 px. Release past one third, or a
  flick, completes the turn; otherwise it falls back. Swipe right on the
  reader curls back. Respect `prefers-reduced-motion` (fall back to a short
  fade). Mockup: `/data/projects/SVC005-news-aggregator/.superpowers/brainstorm/*/content/page-curl.html`.

### Previous editions (stage 5)

Browse by date; search box over `stories_fts` with results grouped by
edition. Name on screen: "Previous editions".

### Notifications (stage 6)

- Morning: after assemble, one push with the top headline; tapping opens
  the edition.
- Urgent watch: every 30 min from 06:00 to 22:00, a light run —
  collect the fast sources, filter, match against interest rows flagged
  `urgent`, and ask the writer "is this urgent for this reader?" with a strict
  bar. Push at most 3 a day; never the same story twice. Between 22:00 and
  06:00 only emergency-kind matches (fire, evacuation, severe weather
  warning for his area). Alerted stories are marked in the next edition.
- Reddit is excluded from the urgent watch (rate limit).

### Learning (stage 7)

Record `seen` (scrolled into view for >1 s), `opened` and `read_full`.
Weekly, compute per-kicker and per-source open rates and turn them into
bounded rank nudges (±15 % of a cluster's score at most). Nudges never decide
"You should know" on their own and never override the interest list.

### Settings (stage 8)

Interest list editor, sources (add, test, enable), sections, filler
patterns, writer choice, notification limits — restyled in the Paper look.

### Testing

- Unit tests with saved real fixtures for every parser and pure function
  (normalise, filter, cluster thresholds, rank, writer output parsing).
- A saved real day (raw collected items, 2026-10-13 or later) is the
  regression set for filter, cluster and rank: the expected merges and drops
  are listed and checked.
- Per the house rules, no Playwright verification of the app; each stage
  ends with a numbered list for Jesse on the dev container.

### Delivery

Each stage is a branch → dev container → Jesse's checks → pull request.
No version bumps or patch notes until Jesse calls a release.

### Out of scope

Reddit OAuth app key; multiple users; native app; any change to how prod is
deployed.
