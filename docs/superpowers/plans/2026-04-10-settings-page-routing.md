# Settings Page Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Settings, Archive, and Pipeline into full-viewport pages with real URL routing (`/settings`, `/archive`, `/pipeline`), and consolidate the floating Theme/Notifications/Install controls into a new General tab inside Settings.

**Architecture:** A ~50-line client-side router in `public/app.js` maps four paths to four view containers. In-app navigation uses `history.pushState`; browser back triggers `popstate`. The current collapsing `.panel` CSS is replaced with a `.view` / `.view--active` show/hide pair so only one view is visible at a time. A catch-all Express route and a service-worker SPA-fallback handle cold loads and refreshes on any sub-path. The Theme, Notifications, and Install App controls move from static HTML into a new General tab rendered lazily by the existing settings-tab renderer.

**Tech Stack:** Vanilla JS (no framework, no router library), Express 4, service worker, plain CSS.

**Spec:** `docs/superpowers/specs/2026-04-10-settings-page-routing-design.md`

---

## File Structure

Files changed in this plan:

- **`server.js`** — add one catch-all route at the bottom of the route list to serve `index.html` for any non-API, non-static path.
- **`public/sw.js`** — bump cache name, add SPA navigation fallback.
- **`public/index.html`** — add `view` class to the four view containers, remove the three floating controls from the settings panel, add a new `General` tab button, and add a `<template>` element with the General tab's body.
- **`public/style.css`** — delete the `.panel` collapse rules, add `.view` / `.view--active` visibility, add `.btn-icon--active` state.
- **`public/app.js`** — add the router object, add `loadGeneralTab`, rewire the three header buttons and three close buttons to call the router, remove the old `closeAllPanels` / `hidden`-toggle logic, update Escape handler, move default active tab from `sources` to `general`, make theme/notif/install init safe when their elements don't yet exist, and call `router.init()` from the bottom of the init section.

No new files are created.

---

## Task 1: Express catch-all route for SPA paths

**Why first:** This is a pure backend change that can be verified in isolation with `curl` before any frontend change. If this step is broken, the frontend tasks won't boot cleanly on a refresh of a sub-path.

**Files:**
- Modify: `server.js` (insert new route after line 93, before `app.listen`)

- [ ] **Step 1: Add the catch-all route**

Open `server.js` and insert this block immediately after the last `app.use('/api', require('./src/routes/backup')(db, DB_PATH));` line and before the `// Start server` comment:

```js
// SPA fallback: any non-API, non-static path returns index.html so the
// client-side router can handle /settings, /archive, /pipeline, etc.
// Must be registered AFTER all /api routes and express.static middleware.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
```

- [ ] **Step 2: Restart the local Node server and verify**

Stop any running instance, then:

```bash
cd /data/projects/SVC005-news-aggregator/daily-gump
node server.js &
SERVER_PID=$!
sleep 1
curl -s -o /tmp/root.html -w "root status=%{http_code}\n" http://localhost:3100/
curl -s -o /tmp/settings.html -w "settings status=%{http_code}\n" http://localhost:3100/settings
curl -s -o /tmp/archive.html -w "archive status=%{http_code}\n" http://localhost:3100/archive
curl -s -o /tmp/api_health.json -w "api status=%{http_code}\n" http://localhost:3100/api/health
diff /tmp/root.html /tmp/settings.html > /dev/null && echo "settings == root (correct)" || echo "MISMATCH"
diff /tmp/root.html /tmp/archive.html > /dev/null && echo "archive == root (correct)" || echo "MISMATCH"
cat /tmp/api_health.json
kill $SERVER_PID
```

Expected output:
```
root status=200
settings status=200
archive status=200
api status=200
settings == root (correct)
archive == root (correct)
{"status":"ok","version":"..."}
```

If any non-`/api/*` path returns 404, the route isn't registered or is registered in the wrong order. If `/api/health` returns `index.html`, the catch-all was registered before the API routes — move it to the bottom.

- [ ] **Step 3: Commit**

```bash
cd /data/projects/SVC005-news-aggregator/daily-gump
git add server.js
git commit -m "feat: add SPA catch-all route for client-side routing

Serves public/index.html for any non-API, non-static path so the
upcoming client-side router can own /settings, /archive, /pipeline.
Registered after all /api routes so API responses are unaffected."
```

---

## Task 2: Service worker SPA fallback

**Why second:** Also isolated and verifiable on its own. Once deployed, users offline on `/settings` get the cached `index.html`. Keep this change small and strictly additive so it can ship independently of Task 1 if needed.

**Files:**
- Modify: `public/sw.js` (lines 1 and 16-28)

- [ ] **Step 1: Bump cache version and add navigation fallback**

Open `public/sw.js` and replace the file contents with:

```js
const CACHE_NAME = 'daily-briefing-v2';
const PRECACHE = ['/', '/style.css', '/app.js', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Network-only for API calls
  if (url.pathname.startsWith('/api/')) return;
  // SPA fallback: any navigation request returns the cached root index.html
  // so /settings, /archive, /pipeline all boot the shell even offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/').then(r => r || fetch('/'))
    );
    return;
  }
  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      return resp;
    }))
  );
});

// Push notification handler
self.addEventListener('push', (e) => {
  const data = e.data?.json() || { title: 'Daily Briefing', body: 'New briefing available' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: '/icon-192.png', badge: '/icon-192.png'
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
```

Three meaningful changes: `CACHE_NAME` bumped to `v2`, new `if (e.request.mode === 'navigate')` block added, existing cache-first strategy preserved as fallthrough.

- [ ] **Step 2: Verify sw.js syntax**

```bash
cd /data/projects/SVC005-news-aggregator/daily-gump
node -c public/sw.js && echo "sw.js syntax OK"
```

Expected: `sw.js syntax OK`. If there's a syntax error, fix before committing.

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat(sw): add SPA navigation fallback and bump cache to v2

Navigation requests (mode: 'navigate') now fall back to the cached /
so refreshing on /settings, /archive, or /pipeline while offline
returns the cached shell and the client-side router handles the rest.
Cache name bumped to daily-briefing-v2 to invalidate old precache."
```

---

## Task 3: Add the General tab loader (dormant)

**Why third:** This task adds new code that isn't yet called from the UI — no user-visible change. That makes it independently committable and lets us verify the loader, the template, and the safe-init refactor before we tear out the old HTML in Task 4. After this commit, calling `switchSettingsTab('general')` from DevTools renders the tab correctly even though there's no button for it.

**Files:**
- Modify: `public/index.html` (add template near the bottom of `#settings-panel`)
- Modify: `public/app.js` (add `loadGeneralTab`, add `'general'` to loaders map, make theme/notif/install init safe when elements don't exist)

- [ ] **Step 1: Add the General tab template to index.html**

Open `public/index.html`. Inside `#settings-panel`, just before the closing `</div>` of the panel (after line 94 `<div class="settings-tab-content" id="settings-tab-content"></div>`), add a `<template>` element with the General tab body. The resulting end of the settings panel should look like:

```html
      <div class="settings-tab-content" id="settings-tab-content"></div>

      <template id="tpl-general-tab">
        <div class="settings-row">
          <span class="settings-theme-label">Theme</span>
          <div class="theme-switcher" id="theme-switcher">
            <button class="theme-option" data-theme="system" title="System">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              <span>System</span>
            </button>
            <button class="theme-option" data-theme="light" title="Light">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              <span>Light</span>
            </button>
            <button class="theme-option" data-theme="dark" title="Dark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              <span>Dark</span>
            </button>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-theme-label">Notifications</span>
          <button class="btn-notif-toggle" id="btn-notif-toggle">Enable</button>
          <span class="notif-status" id="notif-status"></span>
        </div>
        <div class="settings-row">
          <span class="settings-theme-label">Install App</span>
          <button class="btn-notif-toggle" id="btn-install">Install</button>
          <span class="notif-status" id="install-status"></span>
        </div>
      </template>
    </div>
```

**Do not yet delete the floating rows above the tab bar.** They stay in place for this task so the app keeps working — we'll remove them in Task 4 when the General tab becomes reachable. For the duration of this task the app has two copies of the theme/notif/install markup (the live one above the tab bar and the dormant template). That's intentional.

- [ ] **Step 2: Make theme/notif/install init safe when elements don't exist**

In `public/app.js`, four spots currently assume the theme/notif/install elements exist at script load time. We need them to be safe when the elements are only inside the dormant `<template>`.

Edit `public/app.js` at line 141, which currently reads:

```js
applyTheme(getStoredTheme());
```

Leave that line alone — `applyTheme` already tolerates missing `.theme-option` buttons because it uses `$$('.theme-option').forEach(...)` which iterates zero elements.

Edit the theme-option click-binding block at lines 143-149, which currently reads:

```js
$$('.theme-option').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var mode = btn.dataset.theme;
    localStorage.setItem('theme', mode);
    applyTheme(mode);
  });
});
```

Replace it with a named helper function and call it once at load (harmless — still binds to the static floating markup):

```js
function bindThemeSwitcher() {
  $$('.theme-option').forEach(function(btn) {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function() {
      var mode = btn.dataset.theme;
      localStorage.setItem('theme', mode);
      applyTheme(mode);
    });
  });
}
bindThemeSwitcher();
```

The `data-bound` guard makes the function idempotent so we can call it again from `loadGeneralTab` without double-binding.

Edit `updateNotifUI` at lines ~1620-1651 to bail out safely when the element isn't present. Find the function definition (starts with `async function updateNotifUI()`) and add a guard as the very first line inside the function body:

```js
async function updateNotifUI() {
  var btn = $('#btn-notif-toggle');
  var status = $('#notif-status');
  if (!btn || !status) return;
  // ... rest of existing body unchanged ...
}
```

Edit the `btn-notif-toggle` click handler at lines ~1653-1687 to bail out when the element doesn't exist yet. Extract it into a named helper and guard:

```js
function bindNotifToggle() {
  var btn = $('#btn-notif-toggle');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async function() {
    var status = $('#notif-status');
    btn.disabled = true;
    try {
      var reg = await navigator.serviceWorker.ready;
      var existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint })
        });
      } else {
        var sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(notifVapidKey)
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON())
        });
      }
    } catch (e) {
      if (Notification.permission === 'denied') {
        status.textContent = 'Blocked by browser';
      } else {
        status.textContent = 'Failed: ' + e.message;
      }
    }
    await updateNotifUI();
  });
}
bindNotifToggle();
```

Replace the old `$('#btn-notif-toggle').addEventListener('click', async function() { ... });` block with `bindNotifToggle();` (the new helper is called from both init time and `loadGeneralTab`). The inner async function body is identical to what existed before, just wrapped in the guarded `bindNotifToggle` factory.

Do the same for the install button at lines ~1735-1741. Replace:

```js
$('#btn-install').addEventListener('click', async function() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  var result = await deferredInstallPrompt.userChoice;
  if (result.outcome === 'accepted') deferredInstallPrompt = null;
  updateInstallUI();
});
```

with:

```js
function bindInstallButton() {
  var btn = $('#btn-install');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async function() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    var result = await deferredInstallPrompt.userChoice;
    if (result.outcome === 'accepted') deferredInstallPrompt = null;
    updateInstallUI();
  });
}
bindInstallButton();
```

`updateInstallUI` at lines 1715-1733 already has `if (!btn) return;` so it's already safe.

- [ ] **Step 3: Add `loadGeneralTab` function and wire it into the loaders map**

At the bottom of the settings-tab loaders section in `public/app.js` (right after `loadSourcesTab` or near the other `loadXxxTab` functions — around line 500 is fine, placement is not critical as long as it's before the `switchSettingsTab` caller), add:

```js
// --- Tab: General ---
function loadGeneralTab(container) {
  var tpl = document.getElementById('tpl-general-tab');
  container.appendChild(tpl.content.cloneNode(true));
  // Re-bind interactive controls now that they exist in the DOM
  bindThemeSwitcher();
  bindNotifToggle();
  bindInstallButton();
  // Reflect current state onto the newly rendered controls
  applyTheme(getStoredTheme());
  updateNotifUI();
  updateInstallUI();
}
```

Then edit the `loaders` map inside `switchSettingsTab` at lines 471-480 to add the `general` entry as the first key:

```js
    var loaders = {
      general: loadGeneralTab,
      sources: loadSourcesTab,
      categories: loadCategoriesTab,
      preferences: loadPreferencesTab,
      schedule: loadScheduleTab,
      ollama: loadOllamaTab,
      updates: loadUpdatesTab,
      backup: loadBackupTab,
      log: loadLogTab,
    };
```

- [ ] **Step 4: Verify no regressions**

Start the dev server:

```bash
cd /data/projects/SVC005-news-aggregator/daily-gump
node server.js &
SERVER_PID=$!
sleep 1
```

Open a browser to http://localhost:3100/ and:

1. Confirm the page loads normally (feed visible, no console errors).
2. Click the gear icon → settings panel opens above the feed as before.
3. Confirm the Theme switcher still toggles between System / Light / Dark and the page theme changes.
4. Open DevTools → Console and run: `switchSettingsTab('general')`. Expected: the tab-content container fills with the Theme / Notifications / Install App rows (because the template is cloned in).
5. Confirm theme buttons still work after the tab switch (double-binding guard was respected).

Then stop the server:

```bash
kill $SERVER_PID
```

If the console throws on boot (e.g. `Cannot read properties of null`), one of the `bind*` guards is missing. If the theme toggle stops working after step 4, the `data-bound` guard fired incorrectly — re-check the helper.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js
git commit -m "feat: add General tab loader (dormant, not yet reachable)

Adds <template id=\"tpl-general-tab\"> to index.html with Theme /
Notifications / Install App rows, and a loadGeneralTab() function
that clones the template into the settings tab-content container and
re-runs the theme / notif / install bindings idempotently (via
data-bound guard). Extracts the existing inline bindings into named
helpers (bindThemeSwitcher, bindNotifToggle, bindInstallButton) so
they can be re-called after the tab re-renders. No user-visible
change — the General tab isn't yet wired to a tab button. The next
commit will reach it via the router rewrite."
```

---

## Task 4: Router, view containers, page styling, remove floating rows

**Why atomic:** The HTML structural change (wrapping views), the CSS `.view` system, the router code, and the wiring of header buttons to the router are mutually dependent. Landing them in separate commits would leave the app in a half-broken state between commits. The task is split into many small steps within a single commit.

**Files:**
- Modify: `public/index.html` (add `view` class, remove floating rows, add General tab button, make General active by default)
- Modify: `public/style.css` (remove panel collapse, add view + btn-icon--active rules)
- Modify: `public/app.js` (router object, handler rewiring, default tab change, Escape handler, init call)

- [ ] **Step 1: Wrap view containers in index.html and add General tab button**

Open `public/index.html` and make these edits:

Edit the four view containers so each has the `view` class:

1. Line 40 — change `<div id="archive-panel" class="panel archive-panel hidden">` to:
   ```html
   <div id="archive-panel" class="panel archive-panel view">
   ```
2. Line 50 — change `<div id="settings-panel" class="panel settings-panel hidden">` to:
   ```html
   <div id="settings-panel" class="panel settings-panel view">
   ```
3. Line 97 — change `<div id="pipeline-panel" class="panel pipeline-panel hidden">` to:
   ```html
   <div id="pipeline-panel" class="panel pipeline-panel view">
   ```
4. Line 107 — change `<main id="sections-container">` to:
   ```html
   <main id="sections-container" class="view view--active">
   ```
   (The `view--active` class here ensures the feed is visible on first paint before the router runs.)

Remove the floating controls at the top of the settings panel. Lines 57-83 in the current `index.html` contain:

```html
      <div class="settings-theme">
        ... Theme switcher ...
      </div>
      <div class="settings-row">
        ... Notifications toggle ...
      </div>
      <div class="settings-row">
        ... Install App button ...
      </div>
```

Delete all three of those blocks. The settings panel, after this edit, should flow directly from the `</div>` closing `.panel-header` straight into `<div class="settings-tabs" id="settings-tabs">`.

Add the General tab button as the first tab. Line 84 currently reads:

```html
      <div class="settings-tabs" id="settings-tabs">
        <button class="settings-tab active" data-tab="sources">Sources</button>
```

Change to:

```html
      <div class="settings-tabs" id="settings-tabs">
        <button class="settings-tab active" data-tab="general">General</button>
        <button class="settings-tab" data-tab="sources">Sources</button>
```

Note that the `active` class moves from Sources to the new General tab.

- [ ] **Step 2: Replace panel CSS with view CSS**

Open `public/style.css` and delete lines 250-271 (the entire `/* Panels (archive, settings, pipeline) */` block):

```css
/* Panels (archive, settings, pipeline) */
.panel {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 20px;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.panel.hidden {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.panel:not(.hidden) {
  max-height: 80vh;
  padding-top: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
  overflow-y: auto;
}
```

Replace it with:

```css
/* Views (one is active at a time; router manages .view--active) */
.view {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 16px 20px;
}

.view:not(.view--active) {
  display: none;
}

/* Panels (archive, settings, pipeline) — visual styling, no layout */
.panel {
  /* .view handles width/padding; .panel is now just a semantic hook */
}
```

Also delete the floating-control styles that we removed from the HTML. Delete the entire `.settings-theme` block at lines 631-638 (the 8-line selector), since `.settings-row` is reused inside the General tab template and we want to keep its definition.

Find the `.btn-icon` definition at line 153 and add an active state immediately after the `.btn-icon:hover` block (around line 172):

```css
.btn-icon.btn-icon--active {
  color: var(--accent);
  border-color: var(--accent-dim);
  background: var(--bg-card);
}
```

- [ ] **Step 3: Add the router object to app.js**

Open `public/app.js`. Insert a new section at the top of the file, immediately after the `'use strict';` line (or the first `var $ =` declaration if there's no strict pragma — find line 1 and place this block before any route handlers). Actually, place it just before the init section (before line 1756 `// 15. Init`) so it's adjacent to `router.init()`:

```js
// ============================================================
// 14b. Router
// ============================================================

var router = (function() {
  var ROUTES = {
    '/':         { viewId: 'sections-container', btnId: null,           title: 'Daily Briefing' },
    '/settings': { viewId: 'settings-panel',     btnId: 'btn-settings', title: 'Daily Briefing — Settings' },
    '/archive':  { viewId: 'archive-panel',      btnId: 'btn-archive',  title: 'Daily Briefing — Archive' },
    '/pipeline': { viewId: 'pipeline-panel',     btnId: 'btn-pipeline', title: 'Daily Briefing — Pipeline' },
  };
  var currentPath = null;

  function normalize(path) {
    return ROUTES[path] ? path : '/';
  }

  function onEnter(path) {
    if (path === '/settings') {
      // Reset per-tab cache and re-render the active tab (default: general)
      Object.keys(tabLoadedState).forEach(function(k) { tabLoadedState[k] = false; });
      var activeTab = $('.settings-tab.active');
      switchSettingsTab(activeTab ? activeTab.dataset.tab : 'general');
    } else if (path === '/archive') {
      loadArchive();
    } else if (path === '/pipeline') {
      openPipelinePanel();
    }
  }

  function onLeave(path) {
    if (path === '/pipeline') {
      closePipelinePanel();
    }
  }

  function render(rawPath) {
    var path = normalize(rawPath);
    if (currentPath && currentPath !== path) onLeave(currentPath);

    // Toggle view visibility
    Object.keys(ROUTES).forEach(function(p) {
      var v = document.getElementById(ROUTES[p].viewId);
      if (v) v.classList.toggle('view--active', p === path);
    });

    // Toggle header button active state
    ['btn-settings', 'btn-archive', 'btn-pipeline'].forEach(function(id) {
      var b = document.getElementById(id);
      if (b) b.classList.toggle('btn-icon--active', ROUTES[path].btnId === id);
    });

    // Update document title
    document.title = ROUTES[path].title;

    if (currentPath !== path) onEnter(path);
    currentPath = path;
  }

  function navigate(path) {
    var target = normalize(path);
    if (target === currentPath) return;
    history.pushState({}, '', target);
    render(target);
  }

  function toggle(path) {
    navigate(currentPath === path ? '/' : path);
  }

  function init() {
    window.addEventListener('popstate', function() { render(location.pathname); });
    render(location.pathname);
  }

  return { init: init, navigate: navigate, toggle: toggle };
})();
```

- [ ] **Step 4: Replace the old panel click handlers with router calls**

In `public/app.js`, replace the existing `btn-archive` handler at lines 420-430 (the `$('#btn-archive').addEventListener(...)` block and its `$('#btn-close-archive')` sibling) with:

```js
$('#btn-archive').addEventListener('click', function() {
  router.toggle('/archive');
});

$('#btn-close-archive').addEventListener('click', function() {
  router.navigate('/');
});
```

Replace the `btn-settings` handler at lines 444-458:

```js
$('#btn-settings').addEventListener('click', function() {
  router.toggle('/settings');
});

$('#btn-close-settings').addEventListener('click', function() {
  router.navigate('/');
});
```

Replace the `btn-pipeline` handler at lines 1312-1327:

```js
$('#btn-pipeline').addEventListener('click', function() {
  router.toggle('/pipeline');
});

$('#btn-close-pipeline').addEventListener('click', function() {
  router.navigate('/');
});
```

- [ ] **Step 5: Delete the now-unused `closeAllPanels` helper**

At lines 438-442, delete the entire `closeAllPanels` function:

```js
function closeAllPanels(except) {
  ['archive-panel', 'settings-panel', 'pipeline-panel'].forEach(function(id) {
    if (id !== except) $('#' + id).classList.add('hidden');
  });
}
```

Search the rest of `app.js` for any other calls to `closeAllPanels` and replace with `router.navigate('/')`. The Escape keyboard handler at lines 1749-1754 is one such caller:

```js
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeAllPanels();
    closePipelinePanel();
  }
});
```

Replace with:

```js
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    router.navigate('/');
  }
});
```

(The pipeline's `closePipelinePanel` is now handled by `router.render`'s `onLeave` hook, so the explicit call here is no longer needed.)

- [ ] **Step 6: Call `router.init()` at the bottom of the init section**

At the very end of `public/app.js` (after line 1786 `setInterval(updatePipelineStatus, 30000);`), add:

```js
// Initialize the router last so it can read the current URL and activate
// the matching view after all bindings are in place.
router.init();
```

- [ ] **Step 7: Smoke-test locally**

Start the server:

```bash
cd /data/projects/SVC005-news-aggregator/daily-gump
node server.js &
SERVER_PID=$!
sleep 1
```

Open http://localhost:3100/ in a browser and run through this checklist:

1. `/` loads, feed visible, no console errors. Gear/archive/pipeline icons are present and none have `btn-icon--active` state.
2. Click the gear icon → URL changes to `/settings`, feed is hidden, settings view fills the content area with no inner scroll box. General tab is the default active tab and shows Theme / Notifications / Install App rows. Gear icon has the active visual state.
3. Click Sources tab → sources list renders inside the same container (no new scroll box).
4. Click the gear icon again → URL returns to `/`, feed visible, gear icon no longer active.
5. Click the archive icon → URL `/archive`, archive list renders full-page. Click close (`×`) → back to `/`.
6. Click the pipeline icon → URL `/pipeline`, pipeline content renders. SSE should connect. Click close → back to `/`, SSE cleanly disconnects (check DevTools network tab).
7. Navigate `/` → `/settings` → press browser back button → feed visible, settings hidden.
8. Paste `http://localhost:3100/settings` into the address bar and press Enter → page loads directly into settings.
9. Paste `http://localhost:3100/nonsense` → page loads at `/`, feed visible (normalize fallback).
10. On `/settings`, click the Theme switcher — theme should change. Toggle Notifications — permission flow runs. Install App — button state reflects PWA state.
11. Press Escape while on any sub-page → returns to `/`.
12. Open DevTools → Application → Service Workers, click "Update" to load the new SW. Check Cache Storage → `daily-briefing-v2` exists, old `-v1` is gone.
13. In DevTools, toggle "Offline" and reload `/settings` → page should still load (SPA fallback).

Stop the server:

```bash
kill $SERVER_PID
```

If any step fails, diagnose before moving on. Common issues:

- Feed hidden on first load → `#sections-container` is missing `view--active` in HTML; check Step 1.
- Panels visible on top of each other → `.view:not(.view--active) { display: none; }` not loaded; check Step 2.
- Clicking gear does nothing → router not initialized; check Step 6. Also check for JS errors in console.
- Active tab is Sources not General → check the `switchSettingsTab(activeTab ? ... : 'general')` fallback in the router's `onEnter`.
- Theme buttons don't work inside General tab → `bindThemeSwitcher()` isn't being re-called in `loadGeneralTab`; check Task 3.

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/style.css public/app.js
git commit -m "feat: route settings/archive/pipeline as full pages with URL routing

Replaces the inline collapsing .panel scroll-box with a .view /
.view--active show-hide system driven by a small client-side router
(history.pushState + popstate). The three header icons now toggle
between /, /settings, /archive, /pipeline via router.toggle(), and
each sub-page fills the content area with no inner scroll container.
Browser back / Android back gesture returns to the feed.

Also moves the floating Theme, Notifications, and Install App
controls into a new General tab (now the default when opening
Settings), so the Settings layout is uniformly tab-driven.

Per-tab URLs within Settings are intentionally out of scope —
current tab state stays internal."
```

---

## Task 5: Push, let CI build, and deploy to Unraid

**Why last:** All code is committed locally. Now we push, let the CI pipeline from the previous session build the image, then update the running container on Unraid. Every step is a single small action with a clear expected output.

**Files:** none — this is a deploy/verification task.

- [ ] **Step 1: Push all commits to GitHub**

```bash
cd /data/projects/SVC005-news-aggregator/daily-gump
git log --oneline origin/main..HEAD
git push origin main
```

Expected: the `git log` line shows the commits from Tasks 1-4 as ahead of origin. `git push` completes without errors.

- [ ] **Step 2: Watch the CI build**

```bash
sleep 5
RUN_ID=$(gh run list --repo ChilliGeologist/daily-briefing --limit 1 --json databaseId --jq '.[0].databaseId')
echo "Watching run $RUN_ID"
gh run watch $RUN_ID --repo ChilliGeologist/daily-briefing --exit-status
```

Expected: build completes successfully in ~2-3 minutes. If the run fails, investigate `gh run view $RUN_ID --repo ChilliGeologist/daily-briefing --log-failed` before proceeding — do not force a deploy on a red build.

- [ ] **Step 3: Capture the new immutable tag**

```bash
NEW_SHA=$(git rev-parse --short HEAD)
NEW_TAG="sha-$NEW_SHA"
echo "New image tag: ghcr.io/chilligeologist/daily-briefing:$NEW_TAG"
```

Save that tag string — it's what you'll enter into the Unraid container template in the next step.

- [ ] **Step 4: Update the Unraid container to the new tag**

Open the Unraid Docker GUI:

1. Click the `daily-briefing` container → Edit.
2. In the Repository field, change the tag from `sha-b149220` (or whatever is currently there) to the new tag from Step 3: `ghcr.io/chilligeologist/daily-briefing:sha-<NEW_SHA>`.
3. Apply. Unraid pulls the new image, stops the old container, and starts the new one.

- [ ] **Step 5: Verify the running container**

From this workstation:

```bash
ssh -i /data/.ssh/id_ed25519 root@192.168.10.10 \
  "docker ps --filter name=daily-briefing --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'; \
   echo '---LOGS---'; \
   docker logs --tail 20 daily-briefing 2>&1"
```

Expected: status is `Up N seconds (healthy)`, image ends in `sha-<NEW_SHA>`, logs show `daily-briefing vXXXXX listening on port 3100` with no errors.

- [ ] **Step 6: End-to-end smoke test in prod**

From this workstation:

```bash
BRIEFING_URL=$(ssh -i /data/.ssh/id_ed25519 root@192.168.10.10 \
  "docker inspect daily-briefing --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'")
echo "Container IP: $BRIEFING_URL"
ssh -i /data/.ssh/id_ed25519 root@192.168.10.10 "curl -sf http://$BRIEFING_URL:3100/api/health"
echo
ssh -i /data/.ssh/id_ed25519 root@192.168.10.10 "curl -s -w 'status=%{http_code}\n' http://$BRIEFING_URL:3100/settings -o /dev/null"
ssh -i /data/.ssh/id_ed25519 root@192.168.10.10 "curl -s -w 'status=%{http_code}\n' http://$BRIEFING_URL:3100/archive -o /dev/null"
ssh -i /data/.ssh/id_ed25519 root@192.168.10.10 "curl -s -w 'status=%{http_code}\n' http://$BRIEFING_URL:3100/pipeline -o /dev/null"
ssh -i /data/.ssh/id_ed25519 root@192.168.10.10 "curl -s -w 'status=%{http_code}\n' http://$BRIEFING_URL:3100/api/sources -o /dev/null"
```

Expected:
- `/api/health` returns `{"status":"ok","version":"..."}`
- `/settings`, `/archive`, `/pipeline` all return `status=200`
- `/api/sources` returns `status=200`

- [ ] **Step 7: User-facing verification**

Open the app at its regular URL (whatever the user normally uses — likely via NPM proxy host) in a browser and run through the smoke tests from Task 4 Step 7 one more time, paying special attention to:

1. PWA back gesture on a phone: open the app, navigate to Settings, press Android back → should return to feed, not exit the app.
2. Hard refresh on `/settings` — should land on settings, not blank page.
3. Offline refresh on `/settings` — should serve cached shell via SW.
4. The previously subscribed push notifications (if any) should still work: VAPID keys were preserved across deploy.

- [ ] **Step 8: No commit needed**

This task makes no code changes. The git history from Tasks 1-4 is the complete record.

---

## Self-Review Notes

**Spec coverage check:**

| Spec requirement | Task |
| --- | --- |
| Map four paths to four views | Task 4 Step 3 (router ROUTES table) |
| `history.pushState` + `popstate` | Task 4 Step 3 (`navigate`, `init`) |
| Cold-load reads `location.pathname` | Task 4 Step 3 (`init` calls `render(location.pathname)`) |
| Unknown paths fall back to `/` | Task 4 Step 3 (`normalize`) |
| Feed loads regardless of route | Already true — `loadBriefing()` at init; unchanged |
| Header stays visible | No change to header markup; achieved by design |
| Wrap views in shared class | Task 4 Step 1 |
| Default active tab = General | Task 4 Step 1 (HTML `active` class moves) |
| Delete `.panel` collapse CSS | Task 4 Step 2 |
| Add `.view` / `.view--active` CSS | Task 4 Step 2 |
| Add `.btn-icon--active` state | Task 4 Step 2 |
| Router object with init/navigate/render | Task 4 Step 3 |
| Rewire header buttons | Task 4 Step 4 |
| Rewire close buttons | Task 4 Step 4 |
| Popstate listener | Task 4 Step 3 (`init`) |
| `loadGeneralTab` case in renderer | Task 3 Step 3 |
| Move Theme/Notif/Install into General tab | Task 3 Step 1 (template) + Task 4 Step 1 (delete floating rows) |
| Preserve existing IDs | Task 3 Step 1 (same IDs in template) |
| Service worker SPA fallback | Task 2 |
| Bump CACHE_NAME | Task 2 |
| Server catch-all | Task 1 |

All spec requirements are covered.

**Placeholder scan:** no TBDs, no "implement later", no references to undefined helpers.

**Type consistency:** `switchSettingsTab`, `loadGeneralTab`, `bindThemeSwitcher`, `bindNotifToggle`, `bindInstallButton`, `tabLoadedState`, `router.init`, `router.navigate`, `router.toggle`, `router.render` are all used with consistent spelling throughout the plan.
