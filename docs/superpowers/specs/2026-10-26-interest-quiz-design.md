# Interest quiz — design

Date: 2026-10-26. Status: draft for Jesse's approval. Builder check done 2026-10-26.

## For Jesse: what you'll get

**Why.** The paper only knows what you like from a short list written by hand
and from what you open. You can't name what's missing from it — "that's the
whole point of the paper". The quiz finds out by showing you real headlines,
far wider than news, and watching what you'd read.

**Where.** In the paper's own app, on your phone. Settings gets a "Tune your
paper" entry. It looks like the rest of the paper: cream page, serif type.

**How it works.**
1. You tap Start. The app spends a few minutes gathering real headlines from
   the past week — from the places the paper already reads, plus a much
   larger set of extra places it doesn't (science, space, money, cars, food,
   maker projects, history, odd internet stories, trends and more). You can
   leave and come back; it tells you when it's ready.
2. It shows one headline at a time: the headline, the outlet's name, and the
   outlet's own one-line teaser if it has one. Three buttons: **I'd read
   this**, **Maybe**, **Not for me**, and a small **Skip** for ones you can't
   judge.
3. About 150–200 headlines in a round. You can stop any time and pick up
   where you left off. Later rounds are there if you want them; each one
   leans toward the areas the last round left unclear.

**What it learns.** Which subjects you go for and which you skip; what kind
of story you like (someone built something, a deep explainer, a quick
update, a fight at the council); and how far away a story can be before it
stops mattering to you, unless it's serious.

**What you get at the end.** Nothing changes until you say yes. A results
page in three parts:
1. **What you like and skip**, in plain sentences.
2. **Changes to your interests** — new ones to add, ones to rate up or down,
   ones to drop — each with its own yes/no.
3. **Places the paper is missing** — outlets that carried headlines you'd
   read but the paper doesn't follow, each showing the headlines that earned
   it, each with a yes/no. Saying yes adds it to the paper's sources.
4. **New sections**, only when a subject clearly earns one (say "Science &
   space"). Each offer gives its reasons: how many of those headlines you
   said you'd read, how that compares with the rest of the round, and which
   places would fill it. Subjects that don't earn a section go into
   "Around the internet".

**What it won't do.** It won't change the rule that big news always makes
the top section. It doesn't count as opens or reads for the weekly learning.

**What you'll judge when it's built.** Whether the headlines feel wide
enough, whether the round is a pleasant length on your phone, and whether
the results page describes you correctly.

---

## Technical design

### Current state

- Interests are a settings value `interests`: a list of
  `{label, kind: place|topic|product, terms[], weight: 1|2|3, urgent, requires_place?}`
  normalised in `src/settings.js`; defaults in
  `src/pipeline/writer/interests.js`. Matching is whole-term on text
  (`matchInterests`).
- Sections are a fixed code list in `src/pipeline/writer/sections.js`
  (tasmania, australia, world, tech, homelab, gaming, sport, internet; plus
  `top`). Settings can reorder and hide them.
- Sources live in the `sources` table; kinds handled by
  `src/pipeline/sources/{rss,reddit,api}.js`; Google News search feeds are
  plain RSS and their links resolve via `src/pipeline/gnews.js`. Reddit is
  unauthenticated and queued at ~1 request/minute
  (`src/reddit-request-queue.js`).
- Weekly learning (`src/learning.js`) nudges ranking from `story_events`
  (seen/opened/read_full) with caps; it never touches "You should know".
- Local model: Ollama `gemma4:26b` (settings `ollama_model`,
  `writer_ollama_model`).
- Prod DB is real data (211+ editions). Schema changes must be additive.

### Parts

**1. Discovery catalogue (code constant, data-driven).**
A curated list of extra feeds, each tagged with one *area* from a fixed area
list. Target: about 25 areas × 3–6 feeds each, 100–150 feeds. Areas at
minimum: West Tamar/Launceston, Tasmania, Australia politics, Australia
general, world, world politics, business & money, property, personal finance,
tech industry, security, AI, self-hosting & homelab, maker/DIY/"I built
this", home automation, gaming (mainstream), gaming (indie), science, space,
health, environment & climate, cars & EVs, energy & solar, food & cooking,
sport (AFL, cricket, other), history, culture/film/TV/music, odd/weird news,
internet culture & trends, long reads. Prefer plain RSS and Google News
topic/search feeds over Reddit (rate limit); allow at most ~10 Reddit feeds,
fetched through the existing queue. The catalogue is not added to the
paper's sources — it is only read for quiz rounds.

Each feed must be **tried on real data before it goes in the list**: fetch
it, confirm items from the last 7 days, confirm headlines read as real
headlines. Feeds that fail are dropped; the plan records the trial.

**2. Round building.**
On Start, a background job:
- fetches the paper's enabled sources and the catalogue (last 7 days only),
  reusing the existing fetchers, filter (stale/filler) and clustering so one
  story appears once;
- tags each candidate with: area (from its feed; for paper sources, from the
  existing section mapping), *story type* from a fixed list (made/built
  something, explainer/long read, news update, analysis/opinion,
  announcement/release, human interest, guide/how-to, discussion/question,
  list/round-up), and *distance* (West Tamar/Launceston, rest of Tasmania,
  Australia, overseas, n/a). Story type and distance come from one batched
  call to the local model; distance falls back to the existing Tasmanian
  places matching. The tagger is tested on real headlines before the round
  builder relies on it, and odd results are listed in the plan;
- picks 180 headlines: every area gets at least 4; story types spread
  across areas; about a quarter drawn from the paper's own sources so the
  answers can be compared with what the paper already shows; distance-probe
  pairs for local/state news (same kind of story, near vs far);
- shuffles, keeping no more than two from one area in a row.

Progress is shown ("Gathering headlines… 64 of 140 places read"). A round
that fails to build says so plainly and offers Try again.

Later rounds weight the pick toward areas whose answers were mixed or thin
and away from areas that were clearly settled. *Thin*: fewer than 4
answered. *Settled*: at least 6 answered and a score of 0.2 or less, or 0.8
or more (scoring in part 5). *Mixed*: everything else. Later rounds never
repeat a headline already answered; if the pool runs short a round is built
smaller (minimum 60), and below that the app says to try again in a few
days. (Builder-check answers, my calls.)

*Model load (my call).* Filtering and clustering run first; then a
pre-sample of about 400 candidates, keeping the area minimums, is all that
goes to the tagger. Round building uses the same "main pipeline running"
guard the urgent watch uses: it will not start, or it pauses, while the
morning run is going, and Start is refused 03:30–05:30 with a plain
message.

*Rounds (my call).* One open round at a time; Start resumes it. The app is
single-user and `/tune` sits behind the same access as the rest of it.

**3. The quiz screen.**
Route `/tune` (Paper look). One card: headline, outlet name with "(Google
News)" stripped, outlet teaser if it is more than the headline. Buttons
I'd read this / Maybe / Not for me; Skip as a text link. Undo for the last
answer. Progress line ("47 of 180"). Each answer saves immediately so the
round resumes after closing the app. Must work at phone, tablet and desktop
widths.

**4. Storage (new tables only).**
- `quiz_rounds` (id, started_at, built_at, finished_at, status, error)
- `quiz_items` (round_id, position, title, teaser, url, outlet, feed_key,
  in_paper_sources bool, area, story_type, distance)
- `quiz_answers` (round_id, position, answer: read|maybe|no|skip, at)
- `quiz_proposals` (round_id, kind: interest_add|interest_change|interest_drop|source_add,
  payload JSON, evidence JSON, decision: pending|yes|no, decided_at)

Quiz answers are never written to `story_events`.

**5. Results.**
Score per area, per story type, per distance: read = 1, maybe = 0.5, no = 0,
skip ignored; report an area only with at least 4 answers. Then:
- *Plain sentences* for the top likes and clear dislikes (written by the
  local model from the numbers, checked against them; the page lists the
  numbers behind each sentence on tap).
- *Interest proposals*: the local model reads the "I'd read" and "Not for
  me" headlines with the current interest list and proposes adds
  (label, kind, terms, weight 1–3), weight changes and drops, each with the
  headlines that support it. Validated through the existing interest
  normaliser before being shown; terms must appear in the supporting
  headlines or be close variants.
- *Source proposals* are per **outlet**, not per feed (my call). Liked
  headlines are grouped by their real outlet (Google News links resolved
  via `gnews.js`). An outlet with at least 3 "I'd read" answers and a read
  rate at or above the round's overall rate is proposed with those
  headlines. Yes adds the outlet's own RSS feed (found with the existing
  `src/sourceDetect.js`); if it has none, a Google News `site:` search feed,
  the way AP and Reuters already come in. Outlets the paper already follows
  are not proposed. Also list areas you liked where the round found too
  few headlines to judge.
- *Where an accepted source goes:* the section its area maps to, by a table
  from area to section. Areas with no matching section go to `internet`
  unless a new section was accepted for them.
- *Section proposals* (Jesse, 2026-10-26: "It can offer, but needs
  reasoning"). Proposed for an area, or a pair of close areas (science +
  space), when it has at least 8 answers, a score of 0.7 or more, and at
  least 2 accepted-or-proposed outlets to fill it (thresholds my call).
  Each offer must state its reasons in plain words with the numbers:
  "You said you'd read 9 of 11 science and space headlines, against 4 in
  10 across the whole round. NASA, New Scientist and Ars Technica's
  science feed would fill it." Yes creates a custom section. This needs
  sections to stop being only a code list: built-in sections stay as they
  are; accepted custom sections are stored in settings (id, title, the
  areas they take) and join the existing reorder/hide settings; the writer
  and section mapping read the combined list. A custom section can be
  removed in Settings; its stories then fall back to `internet`.
- Each proposal applies only on its own yes. Applied changes go through the
  same settings/sources code paths as the Settings page.

**6. Story type and distance in the paper.**
Shown on the results page. Turning story-type liking into ranking is **not**
in this build (see Out of scope); where a type can be expressed as an
interest (e.g. "Show HN", "I built"), it becomes an interest proposal.
Distance results are stored and shown only. The separate fix that keeps
far-off warnings and crime out of "You should know" uses its own fixed
rule and reads nothing from the quiz (my call).

### Testing

Unit tests for picking (area minimums, spread, no runs of three), scoring,
proposal thresholds, the interest validator path, and resume. Real-data
trials (not unit tests) for the catalogue feeds and the tagger, recorded in
the plan. Front-end tests stay pure logic; the screen is checked in a
browser at three widths.

### Out of scope

- Ranking by story type.
- Changing what counts as big news or the top section's rules.
- Feeding quiz answers into weekly learning.
- Any change to prod settings or sources without Jesse's yes on the results
  page.

### Left to the builder

Exact feed list (within the trial rule), the fixed area list's final
wording, model prompts, card styling within the Paper look, how undo is
shown.
