# Settings, Archive, and Pipeline as Full Pages with URL Routing

**Date:** 2026-04-10
**Status:** Approved, ready for implementation planning

## Background

The Daily Briefing PWA currently shows Settings, Archive, and Pipeline as inline collapsing panels that sit between the header and the news feed. When opened they expand to `max-height: 80vh` with `overflow-y: auto`, so the content is trapped inside an inner scroll box above the feed. This is awkward to use — especially Settings, which has eight tabs of dense content — and feels unlike a real app screen.

Settings also has three floating controls (Theme, Notifications, Install App) above its tab bar, which makes the settings layout inconsistent with itself.

## Goal

1. Settings, Archive, and Pipeline each become a full-viewport "page" that replaces the news feed when active, not an inline scroll box above it.
2. Navigation between pages uses real URLs and `history.pushState`, so the browser/Android back gesture works like a native app and deep links are possible.
3. Settings' floating Theme/Notifications/Install App controls move into a new **General** tab, so the Settings layout is uniformly tab-driven.

## Non-goals

- No per-tab URLs within Settings (e.g. `/settings/ollama`). Tab state stays internal.
- No animated page transitions.
- No visual redesign of Settings/Archive/Pipeline content — only the containers change.
- No router library. A ~40-line hand-rolled router is sufficient.

## Architecture

A small client-side router in `public/app.js` maps four paths to four "views":

| Path         | View                              |
| ------------ | --------------------------------- |
| `/`          | News feed (`<main id="sections-container">`) |
| `/settings`  | Settings panel                    |
| `/archive`   | Archive panel                     |
| `/pipeline`  | Pipeline panel                    |

On cold load, the router reads `location.pathname`, activates the matching view, and updates the active state on the header icon buttons. Unknown paths silently redirect to `/`. The feed's data is still fetched on every cold load regardless of route, so pressing back from any sub-page returns instantly with no loading state.

The site header (title, date, headline, three icon buttons) remains visible on every route. Clicking an already-active icon toggles back to `/`, preserving the current "tap the gear to toggle" muscle memory.

## Components

### 1. DOM structure (`public/index.html`)

- Wrap `#sections-container`, `#settings-panel`, `#archive-panel`, `#pipeline-panel` in a shared `view` class so they are interchangeable siblings under `#app`.
- Remove the `hidden` class from the three panel divs in the initial markup — the router controls visibility from first paint.
- Inside `#settings-panel`:
  - Remove the three floating rows (`.settings-theme`, the Notifications `.settings-row`, the Install App `.settings-row`) that currently sit above `.settings-tabs`.
  - Add `<button class="settings-tab active" data-tab="general">General</button>` as the first tab in `.settings-tabs`. Move the `active` class off Sources.

### 2. CSS (`public/style.css`)

- Delete the `.panel` collapse behavior: remove `max-height`, `overflow: hidden`, `transition: max-height`, and the `.panel.hidden` / `.panel:not(.hidden)` rules.
- `.panel` becomes a plain content container with the existing `max-width`, `margin: 0 auto`, and padding.
- Add a single visibility rule: `.view:not(.view--active) { display: none; }`.
- The active view fills the remaining viewport below the header and scrolls with the page (no inner scroll container).
- Add a `.btn-icon--active` state on the three header icon buttons for the active route (subtle background or underline matching the existing design language).
- Remove any now-unused selectors left behind by the old collapsing behavior.

### 3. Router (`public/app.js`)

A `router` object with three methods:

- `router.init()` — called on `DOMContentLoaded`. Registers the `popstate` listener, rebinds the header icon and close buttons to `router.navigate(...)`, and calls `router.render(location.pathname)` to set the initial view.
- `router.navigate(path)` — calls `history.pushState({}, '', path)` then `router.render(path)`. This is what every in-app navigation click calls.
- `router.render(path)` — the single source of truth for view state. It:
  1. Normalizes unknown paths to `/`.
  2. Toggles `.view--active` so only the matching view is visible.
  3. Toggles `.btn-icon--active` on the three header icon buttons.
  4. Sets `document.title` (e.g. `Daily Briefing — Settings`).
  5. Calls the existing lazy-load function for that view if applicable (`loadArchive()`, `loadPipelineStatus()`, `loadSettingsTab('general')`).

Nav wiring:

- `#btn-settings`, `#btn-archive`, `#btn-pipeline` click handlers change from "toggle `.hidden`" to `router.navigate('/settings' | '/archive' | '/pipeline')`. If the target route is already active, navigate to `/` instead (preserves the toggle behavior).
- `#btn-close-settings`, `#btn-close-archive`, `#btn-close-pipeline` call `router.navigate('/')`.
- Browser back/forward triggers `popstate`, which calls `router.render(location.pathname)`. No `pushState` on popstate (avoids loops).

### 4. General settings tab (`public/app.js`)

The existing tab content renderer (`loadSettingsTab` or equivalent that switches on `data-tab`) gains a `general` case. The renderer outputs, into `#settings-tab-content`, the same HTML currently living above `.settings-tabs`:

- The Theme switcher (`#theme-switcher` with System / Light / Dark buttons)
- The Notifications row (`#btn-notif-toggle` + `#notif-status`)
- The Install App row (`#btn-install` + `#install-status`)

All existing element IDs are preserved, so the existing bind code for theme switching, notification permission, and PWA install prompt continues to work unchanged. The binding runs on tab render (lazy init, same pattern as the other tabs).

The default active tab when landing on `/settings` is General.

### 5. Service worker (`public/sw.js`)

- Bump `CACHE_NAME` from `daily-briefing-v1` to `daily-briefing-v2` to invalidate the old precache.
- Add SPA-fallback handling in the fetch listener: detect navigation requests and serve cached `/` for any path. This means refreshing `/settings` while offline returns the cached `index.html`, the router reads `location.pathname`, and the right view shows.

   ```js
   if (e.request.mode === 'navigate') {
     e.respondWith(caches.match('/').then(r => r || fetch('/')));
     return;
   }
   ```

### 6. Server catch-all route (`server.js`)

Express currently serves `index.html` only at `/` (via `express.static`). A direct request to `/settings` on a cold load (or a page refresh) returns 404, which the SW cannot intercept on the first visit. Add a catch-all at the bottom of the route list, after static middleware and all `/api` routes:

```js
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
```

This must be registered **after** `app.use('/api', ...)` so API routes still get matched first, and it must only serve the HTML file — never an error page.

## Data flow

1. User navigates to any path (cold load, click, or back gesture).
2. Express serves `index.html` for any non-API, non-static path.
3. `app.js` boots, `router.init()` reads `location.pathname`, activates the matching view.
4. Regardless of the active view, `loadBriefing()` runs on boot so the feed is ready if the user navigates back.
5. View-specific lazy loaders (archive list, pipeline status, settings tab content) run when the router shows their view.
6. In-app navigation calls `router.navigate(path)` → `pushState` + `render`. No page reload.
7. Browser back/forward fires `popstate` → `render(location.pathname)` without `pushState`.

## Error handling

| Case | Behavior |
| --- | --- |
| Unknown path (`/foo`) | `render()` silently redirects to `/`. No 404 shown. |
| `popstate` to unknown state | Same — treat as `/`. |
| Cold load on `/settings` with no briefing yet | Settings renders immediately; feed loads in background; back gesture returns to a ready feed. |
| Cold load offline on `/settings` | SW serves cached `/` as navigation fallback; router shows settings from `location.pathname`. |
| Express receives `/settings` on cold load | Catch-all returns `index.html`; same router path as above. |
| User clicks header icon for already-active route | `router.navigate('/')` instead — icons toggle. |
| API calls (`/api/*`) | Unchanged — not matched by the catch-all. |

## Testing plan

Manual smoke test after deploy:

1. `/` loads, feed visible, gear icon not active.
2. Click gear → URL is `/settings`, settings view fills viewport below header, no inner scroll box, General tab active by default showing Theme / Notifications / Install App.
3. Scroll settings — page scrolls naturally, no inner container scroll.
4. Click gear again → URL back to `/`, feed visible.
5. Navigate `/` → `/settings` → `/archive` → `/pipeline` via header buttons. Each shows active state on its icon.
6. Browser back button from `/settings` → `/`, feed already loaded.
7. Direct paste of `/settings` URL → loads directly into settings; back button exits app.
8. Install as PWA, launch, navigate to a sub-page, trigger hardware back gesture → returns to feed, does not exit app.
9. Go offline, refresh `/settings` → cached `index.html` serves, router activates settings.
10. Archive and Pipeline behave identically to Settings (full page, no scroll box).
11. All existing Settings tabs (Sources, Categories, Preferences, Schedule, Ollama, Updates, Backup, Log) still work when clicked.
12. Theme switcher, Notifications toggle, and Install App button work from within the General tab.

## Out of scope

- Per-tab URLs within Settings (`/settings/ollama` etc.).
- Animated view transitions.
- Any visual redesign of Settings, Archive, or Pipeline content.
- Changes to API routes or backend data model.
