# Daily Briefing

A self-hosted news aggregator that collects stories from RSS feeds and Reddit, scores them with a local Ollama LLM, and presents a curated daily briefing through a clean web UI.

## Features

- **RSS & Reddit sources** — add any RSS feed or subreddit as a news source
- **LLM-powered curation** — Ollama scores and summarises articles locally (no cloud APIs)
- **Customisable categories** — organise stories into your own topic categories
- **Scheduled pipeline** — automatically generates briefings on a cron schedule
- **PWA support** — installable as a mobile/desktop app with push notifications
- **Backup & restore** — export/import your database from the settings page
- **Custom branding** — set your own app title in the preferences

## Prerequisites

- Docker
- [Ollama](https://ollama.com) running with a model (default: `gemma4:26b`)
- Both containers on the same Docker network

## Quick Start

```bash
docker run -d \
  --name daily-briefing \
  --network internal \
  -p 3100:3100 \
  -e TZ=UTC \
  -v /path/to/data:/app/data \
  ghcr.io/chilligeologist/daily-briefing:latest
```

Then open `http://<host>:3100` and:

1. Go to **Settings > Ollama** and verify the Ollama URL and model
2. Add your RSS feeds and subreddits in **Settings > Sources**
3. Create categories in **Settings > Categories** to organise stories
4. Set your timezone and schedule in **Settings > Schedule**
5. Run the pipeline manually or wait for the next scheduled run

The `/app/data` volume persists your database, settings, and VAPID keys across restarts.

## Configuration

All configuration is done through the web UI **Settings** page:

| Tab | What it does |
|-----|-------------|
| Sources | Add/remove RSS feeds and Reddit sources |
| Categories | Create and reorder topic categories |
| Preferences | App title, tone, language, boost/penalty keywords, thresholds |
| Schedule | Set daily briefing generation times and timezone |
| Ollama | LLM URL and model configuration |
| Updates | Check for new versions |
| Backup | Export/import database snapshots |
| Log | View pipeline run logs |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | HTTP server port |
| `TZ` | `UTC` | Container timezone |

## Updating

The app checks GitHub for new commits. When an update is available, a badge appears on the settings icon. To update, pull the latest image and recreate the container.

## License

MIT
