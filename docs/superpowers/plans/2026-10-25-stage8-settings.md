# Stage 8 — Settings tidy-up

Written 2026-10-25 while stage 7 waits for Jesse's checks. Not to be built
until he has confirmed stage 7 and answered the questions below. Design
source: `docs/superpowers/specs/2026-10-13-overhaul-design.md` (branch
`docs/overhaul-design`), "Settings (stage 8)".

---

## For Jesse: what you'll get

Settings today is the old app's: eight tabs in the old look, several of which
no longer do anything useful. The list of things the paper watches for (your
places, council and state politics, Plex, UniFi, Dota and the rest) can't be
seen or changed at all. It lives in the code.

After this stage, Settings is one page in the newspaper look, in five parts:

1. **Your interests.** The list the paper watches for, one row each: a name
   ("Plex"), the words that count as a match ("Plex"), how much it matters
   (a little / a lot / most), and two switches: "Can interrupt me" (it may
   send an urgent alert) and "Only near home" (it counts only when a Tasmanian
   place is named too, as council politics does now). Add, change or remove
   rows. A "Try it" box shows which of today's stories a row would catch
   before you save it.
2. **Sources.** Every site the paper reads, grouped by section, each with a
   plain line saying whether it worked this morning and how many stories it
   gave. Turn one off, or add a new one by pasting its address: the app tests
   it and shows a few of its headlines before you save.
3. **Notifications.** On/off, "Send me a test", the most urgent alerts in a
   day (three now), and quiet hours (10pm to 6am now).
4. **The paper.** What time it's written, how many stories in "You should
   know" and each section, and the "learn from what I read" switch from stage
   7.
5. **Behind the scenes.** The AI model choices, the server address, backups
   and the log, folded away at the bottom.

### What goes

- **Categories** (eight old names: "Top Stories", "Trending Online"…). The
  paper now uses its seven sections. The names here were only used by the
  old layout. On your live copy nothing depends on them any more.
- **Preferences** (boost and penalty words). It's empty on your live copy and
  your interests list does the same job better.

### Questions for you

1. **One page or tabs?** I recommend one page with the five parts above and a
   small contents list at the top that jumps to each. On a phone, tabs that
   scroll sideways hide half their names.
2. **May I remove Categories and Preferences** as described? Neither has
   anything saved on your live copy.
3. **Section changes:** should you be able to rename, reorder or turn off
   the seven sections here (for example, hide Gaming), or leave sections
   fixed for now? I recommend reorder and hide, but not rename or add, because
   the writer is told the seven by name.

---

## Technical design

- Interests: today `DEFAULT_INTERESTS` in `src/pipeline/writer/interests.js`,
  overridable by the `interests` setting (unset on prod and dev). The editor
  writes the full list to that setting; "Reset to the starting list" restores
  the defaults. Weight maps a little/a lot/most → 1/2/3. Validation: label
  and at least one term; terms trimmed, deduped; whole-word matching as now.
  "Try it" = `POST /api/interests/try` running `matchInterests` over the
  latest edition's stories and the latest candidates file; returns matches.
- Sources: existing `/api/sources`, `/sources/detect`; add per-source last-run
  result from the run's collect stats (store per source on each run if not
  already kept). Add-source flow uses detect, then a fetch preview.
- Notification limits: settings `alert_daily_cap` (3) and
  `quiet_hours` (`["22:00","06:00"]`) read by `src/notifications.js` instead
  of constants; scheduler rebuilt on change.
- The paper: `schedule`, `top_size`, `section_size`, `learning_enabled` (new;
  when off, events are still accepted but nudges are not applied and the
  weekly job skips).
- Sections: `sections` setting with order + hidden flags; assembler skips
  hidden sections and orders by the setting; writer prompt unchanged.
- Remove the Categories and Preferences tabs, routes and `keywordBonus`
  (after confirming prod `preferences` unset; it is as of 2026-10-25). Keep
  the `categories` table untouched (no destructive migration).
- Paper look, light and dark; phone first; contents list jumps; every control
  44 px. On-screen text short, plain, warm.
- Tests: interests validation and round-trip; try endpoint on a real fixture;
  cap/quiet-hours read from settings; hidden section skipped; learning switch
  off leaves order unchanged. New tests fail on the old code.
