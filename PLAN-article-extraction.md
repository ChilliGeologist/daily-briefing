# Plan: Article Content Extraction & Reddit Comments

**Status:** Not started
**Date:** 2026-04-11

## Goal

Improve dedup accuracy and summarisation quality by:
1. Fetching full article content from external links (especially Reddit link posts)
2. Grabbing top Reddit comments for community context
3. Using canonical URLs for instant duplicate detection

## New Pipeline Flow

Collect → Score → **Extract** → Dedup → Categorise → Summarise → Assemble

Extract goes after Score so we only fetch articles for items that survived the score threshold.

## Extract Stage (`src/pipeline/extractor.js` — new file)

### Article content extraction
- For items with `external_url`, fetch the page and extract article text
- Use `@mozilla/readability` + `linkedom` (CJS-compatible, same algo as Firefox Reader Mode)
- Store `article_content` (full text) and `canonical_url` (normalized URL after redirects) on item
- Concurrency limit of 5, 10-second timeout per request
- Graceful failure: if fetch fails, item keeps going with just its Reddit description

### Reddit top comments
- For all Reddit items, fetch `{permalink}.json` to get comments
- Pull top 5-10 comments by score, grab their text
- Store as `top_comments` on the item
- Works for both link posts and self-posts
- No extra dependencies — uses Reddit JSON API already used in collector

## Dedup Improvements (`src/pipeline/dedup.js`)

Three-pass dedup:
1. **URL match (new)** — if two items share the same `canonical_url`, instant duplicate, no similarity needed
2. **Dice similarity on titles (existing)** — character bigram comparison, threshold 0.6
3. **LLM confirmation (existing)** — but now prompt can include article content snippets for better judgement

## Summariser Improvements (`src/pipeline/summariser.js`)

The prompt gets three layers of content:
1. **Article content** (if external link) — the actual news story
2. **Top comments** — community reaction, fact-checks, additional context
3. **Reddit description** (existing fallback) — selftext or snippet

Currently the summariser works from Reddit description snippets (max 500 chars). With article_content, it gets the full article text.

## Files to Change

| File | Change |
|------|--------|
| `package.json` | Add `@mozilla/readability`, `linkedom` |
| **New:** `src/pipeline/extractor.js` | Article extraction + Reddit comment fetching |
| `src/pipeline/index.js` | Add extract stage between score and dedup |
| `src/pipeline/dedup.js` | Add URL-match pass before Dice similarity |
| `src/pipeline/summariser.js` | Use `article_content` and `top_comments` in prompt |
| `public/app.js` | Add "Extract" ring to pipeline visualization |
| `public/style.css` | Potentially adjust ring layout for 7 stages |

## Dependencies

- `@mozilla/readability` — Mozilla's article extraction algorithm (CJS compatible)
- `linkedom` — Fast server-side DOM implementation (CJS compatible)

## Notes from dedup analysis (2026-04-11)

- Cancelled run `4887e5ac`: 50 items, only 1 candidate cluster ("meirl"/"Meirl"), LLM correctly denied merge
- Missed duplicate: "Artemis II Splashes Down" vs "Safe return home. Artemis II mission." (Dice score 0.359, below 0.6 threshold) — different wording, same story
- ~28% of items from r/popular were Reddit meme/discussion posts, not news
- URL-based dedup would catch cases where multiple subreddits link to the same article
