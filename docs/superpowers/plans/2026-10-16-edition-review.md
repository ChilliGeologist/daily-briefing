# Edition review fixes: junk out, photos in, how it was told, broadsheet desktop

Written 2026-10-16 after grading every story of the 15 October dev edition
(run 316b4ee8, 104 stories: 73 good, 11 flawed, 20 junk). Review page:
https://claude.ai/artifact/3SZwULdqeL74w6X3cXbH59

---

## For Jesse: what changes

- **Junk stops reaching the paper.** Stories with nothing behind the headline,
  newsletter teasers, questions, suggestions, programming tutorials and
  celebrity baby news are dropped.
- **Reddit photo posts show their photo.** A rack photo appears with the
  story, and the summary says what's in the picture.
- **People's own projects** stay when they're getting a lot of attention or
  touch something you run (Unraid, Plex, Home Assistant and the rest of your
  list). The rest go.
- **The lead is the day's biggest story.** A local story still reaches "You
  should know", but leads only when it's serious (a fire, a death, a closed
  road, a severe weather warning).
- **Sport gets its own section**, holding only big headlines: grand finals,
  the Olympics, World Cups, the Melbourne Cup, and anything nearly every
  outlet is running.
- **How it was told.** When several outlets cover a story, the app names who
  the story is about (a party, a person, a cause) and shows, outlet by
  outlet, whether each version leans toward or against them, quoting the
  words that show it. No left/right labels.
- **New sources**, all tested: SBS repaired, Pulse Tasmania (it can't lead
  the paper on its own, since it leans to ragebait), Tasmanian Times, the
  Bureau of Meteorology's Tasmanian warnings, Al Jazeera, AP, Reuters, The
  Australian, the Daily Telegraph, iTnews, The Register, Ars Technica, Krebs,
  the Australian Cyber Security Centre, selfh.st, Home Assistant, Unraid,
  UniFi, Sonarr, Radarr, Authelia, Tailscale, ServeTheHome, Jeff Geerling,
  RuneScape and Dota news, PC Gamer, the Reserve Bank and Kottke. Platformer
  and the broken Hacker News feed go.
- **Desktop becomes a broadsheet** (layout A). The paper fills the window, the
  front page has pictures, and each section runs the full width with its
  stories flowing down the columns, so no section leaves a hole beside
  another.

---

## Technical design

Two Codex jobs run in parallel on `feat/stage4-reading-screen`:
**Job 1** = pipeline (tasks 1–7), **Job 2** = reading screen (tasks 8–10).
They meet only at the story data shape below. Job 1 must not edit `public/`;
Job 2 must not edit `src/`. Both may add tests.

### Story data shape (the contract between the jobs)

Every story object in a briefing section (`items` and `more`) may carry:

```js
{
  // existing fields unchanged: id, title, kicker, summary, image, sources,
  // article_html, coverage, ...
  images: ['https://i.redd.it/a.jpg', ...],   // optional; photo posts. images[0] === image
  image_described: true,                       // optional; summary was written from the photo
  told: {                                      // optional; only when 2+ distinct non-Reddit outlets
    outlets: [{ name: 'The Guardian AU', headline: '...', url: '...' }],
    subjects: [{
      name: 'Jordon Steele-John',
      kind: 'person',            // person | party | organisation | cause | government
      stances: [{ outlet: 'news.com.au', stance: 'against', quote: 'Shock accusation' }],
      // stance: 'toward' | 'against' | 'plain'; quote is verbatim from that outlet's own headline/description/text
    }],
    differs: true                // true when at least one subject has two different stances across outlets
  }
}
```

New section `{ id: 'sport', title: 'Sport' }`, ordered after Gaming and before
Around the internet. Section `icon` stays `'globe'` in data; the reading
screen picks its own icon per section id.

### Job 1: pipeline

**Task 1 — drop stories with nothing behind them.**
- A story with no readable article text (< 40 words) and no discussion
  (fewer than 3 real Reddit/HN replies) and no photo is dropped before
  writing. Exempt: weather-warning items (task 5).
- Teaser rule: a single-outlet story with < 150 words of article text is
  dropped unless it is a discussion post judged by its replies, a photo post,
  a release note (task 5) or a warning.
- Validator: a summary that describes the page or the lack of content
  ("no substantial news content", "promotional material", "subscribe",
  "this article", "the page", "membership") is never printed. Drop the story
  if a retry still fails.
- Guardian live blogs (URL contains `/live/` or title ends "– live") are
  dropped; they mix stories.

**Task 2 — Reddit photo posts.**
- In `sources/reddit.js` take the full image, not the thumbnail: the
  `[link]` href when it points at `i.redd.it`, `i.imgur.com` or
  `preview.redd.it`; for gallery posts collect the gallery images from the
  post's own feed content where available. Store `image` and `images` (max 4).
  Check against live feeds of r/homelab and r/selfhosted before writing the
  parser; keep a fixture.
- Writer: when a story's substance is a photo (Reddit post with images and
  < 40 words of body text), send `images[0]` to the model (Ollama `images`
  field, base64; gemma4 has vision) and ask for a summary of what the photo
  shows plus what replies said. Set `image_described: true`. If the image
  can't be fetched or the model call fails, fall back to the text-only rules
  (which will usually drop the story).

**Task 3 — self-promotion and attention.**
- A project post is: HN title starting "Show HN", or a Reddit post whose
  title/body says the poster made/built/released it ("I made", "I built",
  "my app", "I created", "I wrote", "introducing", "just released",
  version-number launch titles from the poster).
- Keep a project post only if (a) it matches the interest list (any
  `product` interest term in title or text), or (b) it has real attention:
  HN score ≥ 150; Reddit `list_position` ≤ 5 on the hot list **and** ≥ 10
  real replies in the post's comment feed (count them while extracting; the
  feed has no vote counts). Otherwise drop.
- Help requests and suggestions: widen the existing help-request filter to
  "how do I / how to handle / should I / which … should / advice / suggestion
  / instead of adding / please add / feature request" style titles from
  Reddit, and posts flaired or phrased as suggestions. Keep the existing
  "<2 real replies" rule for questions.
- Not news (writer prompt + not_news): programming tutorials and personal
  essays (e.g. "The Double Headed Stack Allocator", "Things to know when you
  get cancer").
- Celebrity filler pattern: births, pregnancies, baby announcements,
  engagements, weddings and divorces of entertainers (add to filler patterns
  as a new revision so existing installs pick it up).

**Task 4 — sections, lead and sport.**
- Hacker News, r/linux, Waxy, Kottke and 404 Media never feed World or
  Australia: send them to Tech & Security or Around the internet.
  Bleeping Computer, The Register, Krebs, ACSC always go to Tech & Security.
- Lead: the first "You should know" story is the highest-coverage story of
  the day. A place-matched story leads only when it also matches an `urgent`
  interest (emergencies) or reports a death. Local stories still qualify for
  the top section as now.
- Sport: new category/section `sport`. A sport story (writer decides, plus
  sport source hints) is kept only when (a) it names a big event: grand
  final, Olympic/Olympics/Paralympics, World Cup (final stages), Melbourne
  Cup, NBA Finals, Super Bowl, Ashes, Bledisloe decider, Australian Open,
  State of Origin decider; or (b) coverage ≥ 4 distinct outlets; or (c) it
  names a Tasmanian team on the interest list (JackJumpers, Tasmania Devils)
  and has coverage ≥ 2. Other sport is dropped, wherever it was going.
  Sport never goes in Tasmania or Australia any more.
- Headline checks: retry when the headline starts with a lower-case letter,
  or is only a quote with no named subject (e.g. "We'd end up in court").
- Summary check: retry when the first sentence starts with a pronoun or a
  bare definite noun and names nobody ("The legal action uses…", "It …",
  "This …").

**Task 5 — new source kinds.**
- Weather warnings (source config `{ "kind": "warning" }`): BoM Tasmania
  feed `https://www.bom.gov.au/fwo/IDZ00058.warnings_tas.xml` (needs a
  browser-like user agent). Drop marine/coastal-water warnings and
  "cancellation" notices. Keep land warnings (severe weather, flood, fire
  weather, frost, sheep graziers only if severe) that name a northern area
  (North East, North West Coast, Central North, Launceston, Tamar) or the
  whole state. Kept warnings bypass the text-length rules, count as the
  `Emergencies` interest (urgent) and go to Tasmania.
- Release notes (source config `{ "kind": "release" }`): GitHub release
  feeds and the Unraid/UniFi announcement feeds. Drop pre-releases
  (alpha, beta, rc, nightly, develop, preview, test). For GitHub feeds keep a
  release only when its major or minor version changed from the previous
  stable one in the feed, or its notes mention security/vulnerability/CVE/
  breaking. Section Homelab.
- Source flag `{ "no_solo_top": true }`: a story whose only outlet carries
  this flag may not enter "You should know" and gets no rank boost for
  heat words. Pulse Tasmania gets it.

**Task 6 — keep each outlet's headline (for "how it was told").**
- Clustering currently merges member descriptions into one list. Keep, per
  member, `{ name, headline, description, url, text }` (text = extracted
  article text when available, else description) on the cluster.

**Task 7 — "how it was told" writer step.**
- For each written story with ≥ 2 distinct non-Reddit outlets, one extra
  model call: given each outlet's headline, description and first ~250 words,
  name up to 3 subjects the story is for or against (party, person,
  organisation, cause, government) and for each outlet give `toward`,
  `against` or `plain` with a short quote (≤ 12 words) from that outlet's
  own words that shows it.
- Code validation: drop any stance whose quote is not found (case- and
  quote-mark-insensitive) in that outlet's own headline/description/text;
  drop subjects left with < 2 stances; set `differs`. If nothing survives,
  emit `told` with outlets only (no subjects).
- Prompt guidance: "plain" is the default; reporting an allegation is not
  "against"; loaded words ("shock", "slams", "rage", "disgraced", "hero",
  "brave"), choosing which side's claim leads, and omitting one side's
  response are what count.

### Job 2: reading screen

**Task 8 — broadsheet desktop (≥ 1024 px).**
- Remove the fixed 1400 px paper: the paper fills the window with side
  margins of 40–56 px. Column count by width: 3 at 1024, 4 from 1360,
  5 from 1900; column width never above ~360 px.
- "You should know": the lead spans 2 columns with its picture above the
  headline; the other top stories fill the remaining columns. If the lead
  has no picture, put its "how it was told" panel beside it in the picture's
  place; if it has neither, set the headline larger across 2 columns with
  the summary in two text columns.
- Every other section: a full-width band with its rule and label; its
  stories (items then more, no buttons) flow down the columns
  (`column-count`, `break-inside: avoid`). The section's first story with a
  picture shows it. Two consecutive short sections (≤ 6 stories each) share
  one band side by side, each flowing in half the columns.
- 700–1023 px: same bands with 2 columns. Phone: unchanged.
- The thumb index keeps working (sections are still addressable by id);
  add a Sport icon (a ball or trophy, same drawing style).

**Task 9 — pictures.**
- Front page: lead picture (all widths), the first pictured story per
  section on tablet/desktop. Lazy-load, fixed aspect ratio, no layout jump.
- Reader: photo posts show all `images` stacked at the top (not just the
  hero), each tappable to open full size in a new tab.

**Task 10 — "How it was told" panel.**
- Reader: under the summary when `told` exists. Header "How it was told" and
  "N outlets". For each subject: the subject's name, then outlets grouped
  as "Leans against" / "Plain" / "Leans toward", each with the outlet name
  and its quote in quote marks. Then "Headlines": each outlet's own headline.
  If no subjects survived: just the headlines, with the line "Told much the
  same way." Never show left/right anywhere.
- Front page: when `told.differs`, a small grey mark under the kicker:
  "Told differently · N outlets". Otherwise nothing extra.
- Works in both Paper themes; follows the existing serif/kicker styles.

### Verification

- `npm test` green; new behaviour covered by tests that fail on the old code.
- Job 1 also runs `scripts/self-check.js` logic against a saved candidates
  file where possible; the dev run and grading are done by Claude after
  both jobs land.
- Job 2 reports, per width (390, 820, 1280, 1920), measured empty vertical
  space under each section band and the paper's side margins, from a real
  briefing JSON rendered in a browser if available, otherwise from computed
  layout logic.
