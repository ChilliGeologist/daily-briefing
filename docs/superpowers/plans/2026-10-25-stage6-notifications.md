# Stage 6 — Notifications

Written 2026-10-25, after Jesse confirmed stage 5. Design source:
`docs/superpowers/specs/2026-10-13-overhaul-design.md` (branch
`docs/overhaul-design`), "Notifications (stage 6)". Branch
`feat/stage6-notifications`, stacked on stage 5 (pull request 6).

---

## For Jesse: what you'll get

Today the app can sign your phone up for notifications, but nothing ever
sends one. After this stage:

- **Each morning**, when the paper is ready, one notification: "The Daily
  Gump is ready" with the top headline underneath. Tap it and the paper opens.
- **During the day**, a check every half hour from 6am to 10pm looks at the
  news sites (not Reddit, which only allows about one request a minute) for
  something urgent that touches you: a serious security hole in something you
  run (Unraid, Plex, UniFi, Home Assistant and the rest of your list), or an
  emergency near home (fire, flood, evacuation, severe weather warning for
  West Tamar, Launceston or the north). A possible match goes to the AI with a
  strict question: "would this reader want to be interrupted for this?" Only a
  yes sends a notification. Tapping it opens the story.
- **Limits:** at most three urgent alerts a day on top of the morning one,
  and never the same story twice. Between 10pm and 6am, nothing, unless it is
  an emergency near home.
- **Next morning's paper** marks any story you were alerted about, so you know
  you have seen it.
- **The Status page** lists each check from the day: what it looked at, what
  it nearly sent and why the AI said no. That lets us see whether the bar is
  set right without waiting for a real emergency.
- **Settings** keeps the on/off switch and gains a "Send me a test" button.

Your live copy keeps sending nothing until this is released.

---

## Technical design

### Morning push

- After a scheduled run saves its edition, send one push to every
  subscription: title "The Daily Gump is ready", body = top headline (first
  "You should know" story, else the lead). Payload carries `url: "/"` (or
  `/?edition=<id>`). Manual runs from the Status page do not push unless the
  run was started with a "notify" flag (used by the dev check list). Failure
  to push never fails the run; it is logged.
- `sw.js` `notificationclick` opens/focuses the app at `data.url` instead of
  always `/`; push payload gains `url` and `tag`.

### Urgent watch

- node-cron, every 30 min (`*/30 6-21 * * *` plus the night pass, see below)
  in the settings timezone. Skipped while the main pipeline runs.
- Collect enabled sources except Reddit (`type !== 'reddit'`), normalise,
  filter (existing filler/old-news rules), keep items published in the last
  6 hours and not already seen by the watch (store a seen table keyed by
  canonical URL + title hash; prune after 3 days).
- Candidate = item whose `matchInterests` result includes an `urgent: true`
  match. Product matches additionally need a security/outage word in title or
  teaser (vulnerability, CVE, exploit, breach, zero-day, patch now, critical
  update, outage, compromised…), or come from a `kind: "warning"`/ACSC source.
  Emergency matches need a near-home place (West Tamar, Launceston, Northern
  Tasmania entries — not plain "Tasmania"/Hobart) or a `kind:"warning"` source
  whose text names one.
- Same-story check against earlier alerts today (existing `sameStory` logic)
  so two outlets on one fire make one alert.
- Ask the writer model (the configured writer Ollama model) a strict yes/no
  with a one-line reason, JSON out, temperature 0: urgent only if acting or
  knowing within hours matters to this reader. Fetch article text first
  (existing extractor) when the teaser is thin. Model failure = no alert,
  logged.
- Send: title = short kicker-like label ("Security" / "Emergency near
  home"), body = headline; payload `url` = the stored alert's page
  (`/?alert=<id>` opens a reader page built from the stored alert: headline,
  the model's one-line reason, summary/teaser, link to the original) — or the
  original article URL if building that page is disproportionate; say which.
- Caps, counted per local day in the settings timezone: 3 urgent alerts. Quiet
  hours 22:00–06:00: only emergency-near-home candidates; run the watch hourly
  overnight for those.
- Every check, candidate and verdict is recorded (table `alert_checks` /
  `alerts`) and shown on the Status page in the Paper look: time, sources
  read, candidates with verdict + reason, sent or not and why (cap, quiet
  hours, duplicate, model said no).
- Next edition: stories that match a sent alert (same-story logic) get
  `alerted_at`; the card and reader show a small grey "Alerted 2:15 pm" line.

### Emergency source

- BoM Tasmania warnings is already a source. Look for a public TasALERT or
  Tasmania Fire Service current-incidents feed (RSS/GeoJSON). If one exists
  and returns real data, add it to the dev source list with
  `{"kind":"warning"}`; prod needs it at release (record in the report).

### Settings

- Keep the existing on/off switch. Add "Send me a test" (POST
  `/api/push/test`) which sends "Notifications are working" to all
  subscriptions.

### Tests

- Pure functions for candidate selection, quiet-hours/cap logic, payload
  building, verdict parsing; real saved items as fixtures (an ACSC/Bleeping
  Computer CVE item, a BoM warning, a Hobart fire that must not alert at
  night, a Plex feature release that must not alert).
- New tests fail against the pre-change code; whole-value asserts.
