/* Daily Briefing — Frontend */
'use strict';

// ============================================================
// 0. App Title
// ============================================================

var appTitle = 'The Daily Gump';

async function loadAppTitle() {
  try {
    var res = await fetch('/api/settings/app_title');
    if (res.ok) {
      var data = await res.json();
      if (data.value) appTitle = data.value;
    }
  } catch (_) { /* use default */ }
  var h1 = document.querySelector('header h1');
  if (h1) h1.textContent = appTitle;
  document.title = appTitle;
  scheduleMastheadMeasure();
}

// ============================================================
// 1. Utilities
// ============================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  if (!url) return '';
  try {
    var parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch (e) { /* invalid */ }
  return '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

function el(tag, attrs, children) {
  var e = document.createElement(tag);
  if (attrs) {
    for (var k in attrs) {
      var v = attrs[k];
      if (k === 'textContent') e.textContent = v;
      else if (k === 'className') e.className = v;
      else if (k === 'onclick') e.addEventListener('click', v);
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (v === false || v == null) continue;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
  }
  if (children) {
    if (!Array.isArray(children)) children = [children];
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    }
  }
  return e;
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

// Close any currently-open inline edit form.
function closeOpenEditForm() {
  var open = document.querySelector('.source-item.editing, .source-add.editing, .category-item.editing');
  if (!open) return;
  open.classList.remove('editing');
  var summary = open.querySelector('.source-summary, .source-add-button');
  if (summary) summary.setAttribute('aria-expanded', 'false');
  var btn = open.querySelector('.btn-icon-edit');
  if (btn) btn.textContent = '✎';
  var form = open.querySelector('.source-edit-form, .category-edit-form');
  if (form) form.remove();
}

// Insert trusted SVG markup into an element. Only call with static SVG
// strings defined in the ICONS object below -- never with user data.
function setTrustedSVG(element, svgString) {
  element.insertAdjacentHTML('beforeend', svgString);
}

// ============================================================
// 2. Icons (SVG inline) -- static trusted strings, not user data
// ============================================================

var ICONS = {
  'globe': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  'map-pin': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  'trending-up': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  'shield': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  'server': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
  'gamepad-2': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>',
  'calendar': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  'tag': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  'chevron': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  'check': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  'x': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  'grip': '\u2261',
};

function getIcon(name) {
  return ICONS[name] || ICONS['globe'];
}

function createIconElement(name, className) {
  var span = el('span', className ? { className: className } : {});
  setTrustedSVG(span, getIcon(name));
  return span;
}

// ============================================================
// 3. Theme
// ============================================================

var VALID_THEMES = ['auto', 'system', 'light', 'dark'];
var autoThemeTimer = null;
var selectedTheme = 'system';

function getStoredTheme() {
  var stored = localStorage.getItem('theme') || 'system';
  return VALID_THEMES.indexOf(stored) === -1 ? 'system' : stored;
}

function resolvedTheme(mode, now) {
  if (mode === 'auto') return window.SunTimes.isDarkAt(now || new Date()) ? 'dark' : 'light';
  if (mode === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return mode;
}

function updateThemeColour() {
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  var view = $('#app') && $('#app').dataset.view;
  var property = view === 'reading' || view === 'archive' ? '--paper-page' : '--bg';
  var colour = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
  if (colour) meta.setAttribute('content', colour);
}

function scheduleAutoTheme(now) {
  if (autoThemeTimer !== null) clearTimeout(autoThemeTimer);
  var boundary = window.SunTimes.nextSunBoundary(now);
  var delay = Math.max(1, boundary.getTime() - now.getTime() + 50);
  autoThemeTimer = setTimeout(function() {
    autoThemeTimer = null;
    if (selectedTheme === 'auto') applyTheme('auto');
  }, Math.min(delay, 2147483647));
}

function applyTheme(mode) {
  if (VALID_THEMES.indexOf(mode) === -1) mode = 'system';
  selectedTheme = mode;
  if (autoThemeTimer !== null) {
    clearTimeout(autoThemeTimer);
    autoThemeTimer = null;
  }
  var root = document.documentElement;
  var now = new Date();
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', resolvedTheme(mode, now));
  $$('.theme-option').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.theme === mode);
  });
  updateThemeColour();
  if (mode === 'auto') scheduleAutoTheme(now);
}

applyTheme(getStoredTheme());

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

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
  if (selectedTheme === 'system') applyTheme('system');
});

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible' && selectedTheme === 'auto') applyTheme('auto');
});

// ============================================================
// 4. Reading state
// ============================================================

var currentDate = null;
var currentBriefingId = null;
var currentBriefingIsLatest = false;
var briefingLoadTarget = null;
var briefingLoadSequence = 0;
var alertLoadTarget = null;
var readingStories = new Map();
var readingStoryKeys = new Map();
var readingStoryOpeners = new Map();
var readingFallbackId = 0;
var briefingLoaded = false;
var curlState = { progress: 0, cornerY: 0, sign: 1, dragY: 0, animation: null, gesture: null };
var thumbIndexState = {
  labels: [],
  sections: [],
  finger: null,
  current: -1,
  here: 0,
  picking: null,
  frame: null,
  hereFrame: null,
  glide: null,
  lastFrame: 0
};
var suppressCurlClick = false;
var suppressCurlClickTimer = null;
var readingState = {
  readerOpen: false,
  storyId: null,
  openerId: null,
  briefingScrollTop: 0,
  appHistoryEntry: false,
  alertId: null
};

var STORY_EVENT_STORAGE_KEY = 'daily-gump-story-events-v1';
var storyEventQueue = [];
var storyEventRecorded = new Set();
var storyEventSending = false;
var storySeenObserver = null;
var storySeenTimers = new Map();
var readerReadTimer = null;
var readerHasScrolled = false;

function storyEventIdentity(event) {
  return [event.briefing_id, event.story_key, event.kind].join('\u0000');
}

function loadStoryEventQueue() {
  try {
    var stored = JSON.parse(localStorage.getItem(STORY_EVENT_STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return;
    storyEventQueue = stored.filter(function(event) {
      return event && Number.isInteger(event.briefing_id) && typeof event.story_key === 'string' &&
        ['seen', 'opened', 'read_full'].includes(event.kind);
    });
    storyEventQueue.forEach(function(event) { storyEventRecorded.add(storyEventIdentity(event)); });
  } catch (_) { /* the memory queue still works */ }
}

function saveStoryEventQueue() {
  try { localStorage.setItem(STORY_EVENT_STORAGE_KEY, JSON.stringify(storyEventQueue)); }
  catch (_) { /* the memory queue still works */ }
}

function isEditionStory(key) {
  return Boolean(currentBriefingId && readingStories.has(String(key)));
}

function queueStoryEvent(kind, key) {
  if (!isEditionStory(key)) return;
  var event = {
    briefing_id: Number(currentBriefingId),
    story_key: String(key),
    kind: kind
  };
  var identity = storyEventIdentity(event);
  if (storyEventRecorded.has(identity)) return;
  storyEventRecorded.add(identity);
  storyEventQueue.push(event);
  saveStoryEventQueue();
}

function removeFlushedStoryEvents(events) {
  var sent = new Set(events.map(storyEventIdentity));
  storyEventQueue = storyEventQueue.filter(function(event) { return !sent.has(storyEventIdentity(event)); });
  saveStoryEventQueue();
}

async function flushStoryEvents(useBeacon) {
  if (storyEventSending || storyEventQueue.length === 0 || navigator.onLine === false) return;
  var batch = storyEventQueue.slice(0, 100);
  var body = JSON.stringify({ events: batch });
  if (useBeacon && navigator.sendBeacon) {
    try {
      if (navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))) {
        removeFlushedStoryEvents(batch);
        return;
      }
    } catch (_) { /* fetch below when the page remains alive */ }
  }
  storyEventSending = true;
  try {
    var response = await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body,
      keepalive: true
    });
    if (response.ok) removeFlushedStoryEvents(batch);
  } catch (_) { /* keep the queue for the next flush */ }
  finally { storyEventSending = false; }
}

function stopStorySeenObserver() {
  if (storySeenObserver) storySeenObserver.disconnect();
  storySeenObserver = null;
  storySeenTimers.forEach(function(timer) { clearTimeout(timer); });
  storySeenTimers.clear();
}

function startStorySeenObserver() {
  stopStorySeenObserver();
  if (!currentBriefingIsLatest || !currentBriefingId || !window.IntersectionObserver) return;
  var observedBriefingId = Number(currentBriefingId);
  storySeenObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      var story = entry.target;
      var key = story.dataset.storyId;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && document.visibilityState !== 'hidden') {
        if (storySeenTimers.has(story)) return;
        storySeenTimers.set(story, setTimeout(function() {
          storySeenTimers.delete(story);
          if (storySeenObserver && currentBriefingIsLatest && Number(currentBriefingId) === observedBriefingId &&
              document.visibilityState !== 'hidden') {
            queueStoryEvent('seen', key);
            storySeenObserver.unobserve(story);
          }
        }, 1000));
      } else if (storySeenTimers.has(story)) {
        clearTimeout(storySeenTimers.get(story));
        storySeenTimers.delete(story);
      }
    });
  }, { root: $('#briefing-page'), threshold: [0.5] });
  $$('#briefing-page .reading-story').forEach(function(story) { storySeenObserver.observe(story); });
}

function stopReaderReadTracking() {
  if (readerReadTimer !== null) clearTimeout(readerReadTimer);
  readerReadTimer = null;
  readerHasScrolled = false;
}

function startReaderReadTracking(key) {
  stopReaderReadTracking();
  if (!isEditionStory(key)) return;
  var briefingId = Number(currentBriefingId);
  var storyId = String(key);
  readerReadTimer = setTimeout(function() {
    readerReadTimer = null;
    if (readingState.readerOpen && readerHasScrolled && Number(currentBriefingId) === briefingId &&
        readingState.storyId === storyId) queueStoryEvent('read_full', storyId);
  }, 45000);
}

loadStoryEventQueue();
setInterval(function() { flushStoryEvents(false); }, 20000);
window.addEventListener('online', function() { flushStoryEvents(false); });
window.addEventListener('pagehide', function() { flushStoryEvents(true); });
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') {
    stopStorySeenObserver();
    flushStoryEvents(true);
  } else {
    flushStoryEvents(false);
    if (!readingState.readerOpen) startStorySeenObserver();
  }
});

var MASTHEAD_COLLAPSE_DISTANCE = 96;
var MASTHEAD_REDUCED_THRESHOLD = 48;
var mastheadState = {
  metrics: null,
  frame: null,
  measureFrame: null,
  progress: -1,
  // How folded the masthead was when the reader opened. A story never unfolds
  // it below this: opening one from a folded edition keeps the thin bar.
  readerFloor: 0
};

function activeReadingPage() {
  return readingState.readerOpen ? $('#reader-page') : $('#briefing-page');
}

function clearMastheadPresentation() {
  var header = $('#app > header');
  var title = $('#app-title');
  var date = $('#briefing-date');
  var actions = $('#app > header .header-right');
  if (header) {
    header.classList.remove('masthead-measuring-compact');
    header.style.removeProperty('height');
    header.style.removeProperty('--masthead-progress');
  }
  [title, date, actions].forEach(function(node) {
    if (node) node.style.removeProperty('transform');
  });
  if (title) title.style.removeProperty('font-size');
  if (date) date.style.removeProperty('opacity');
  mastheadState.progress = -1;
}

function mastheadTransform(node, from, to, progress, scale) {
  if (!node || !from || !to) return;
  var x = (to.left - from.left) * progress;
  var y = (to.top - from.top) * progress;
  var size = 1 + (scale - 1) * progress;
  node.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) +
    'px,0) scale(' + size.toFixed(4) + ')';
}

function applyMastheadProgress(progress) {
  var metrics = mastheadState.metrics;
  var app = $('#app');
  if (!metrics || !app || app.dataset.view !== 'reading') return;
  progress = Math.max(0, Math.min(1, progress));
  if (mastheadState.progress === progress) return;
  mastheadState.progress = progress;

  var height = metrics.fullHeight + (metrics.compactHeight - metrics.fullHeight) * progress;
  metrics.header.style.height = height.toFixed(2) + 'px';
  metrics.header.style.setProperty('--masthead-progress', progress.toFixed(4));
  mastheadTransform(metrics.title, metrics.full.title, metrics.compact.title, progress, metrics.titleScale);
  mastheadTransform(metrics.date, metrics.full.date, metrics.compact.date, progress, metrics.dateScale);
  mastheadTransform(metrics.actions, metrics.full.actions, metrics.compact.actions, progress, 1);
  metrics.date.style.opacity = Math.max(0, 1 - progress * 2.5).toFixed(3);

  // The stage is the other flex child, so it grows by exactly the height the
  // masthead gives back. Reuse that delta rather than forcing a layout read.
  layoutThumbIndex(metrics.stageHeight + metrics.fullHeight - height);
  if (curlState.progress > 0.0005 || curlState.gesture) renderCurl();
}

function currentMastheadProgress() {
  var page = activeReadingPage();
  var top = page ? page.scrollTop : 0;
  var progress = prefersReducedMotion()
    ? (top >= MASTHEAD_REDUCED_THRESHOLD ? 1 : 0)
    : Math.min(1, top / MASTHEAD_COLLAPSE_DISTANCE);
  return readingState.readerOpen ? Math.max(mastheadState.readerFloor, progress) : progress;
}

function syncMastheadNow() {
  applyMastheadProgress(currentMastheadProgress());
}

function scheduleMastheadUpdate() {
  if (mastheadState.frame !== null) return;
  mastheadState.frame = requestAnimationFrame(function() {
    mastheadState.frame = null;
    syncMastheadNow();
  });
}

function measureMasthead() {
  mastheadState.measureFrame = null;
  var app = $('#app');
  var header = $('#app > header');
  var title = $('#app-title');
  var date = $('#briefing-date');
  var actions = $('#app > header .header-right');
  var stage = $('#reading-stage');
  if (!app || app.dataset.view !== 'reading' || !header || !title || !date || !actions || !stage) {
    clearMastheadPresentation();
    mastheadState.metrics = null;
    return;
  }

  clearMastheadPresentation();
  // The title never wraps: on a narrow phone (or with a longer name, such as
  // the dev copy's) shrink the full-size title until it fits on one line.
  // Wrapping would double its height, and the scaled copy in the thin bar
  // would then be cut off by the header's overflow.
  title.style.removeProperty('font-size');
  var titleRoom = title.parentElement.clientWidth;
  if (title.scrollWidth > titleRoom) {
    title.style.fontSize = (parseFloat(getComputedStyle(title).fontSize) * titleRoom / title.scrollWidth).toFixed(2) + 'px';
  }
  var full = {
    title: title.getBoundingClientRect(),
    date: date.getBoundingClientRect(),
    actions: actions.getBoundingClientRect()
  };
  var fullHeight = header.getBoundingClientRect().height;
  var stageHeight = stage.getBoundingClientRect().height;
  var fullTitleSize = parseFloat(getComputedStyle(title).fontSize) || 1;
  var fullDateSize = parseFloat(getComputedStyle(date).fontSize) || 1;

  var fittedTitleSize = title.style.fontSize;
  title.style.removeProperty('font-size');
  header.classList.add('masthead-measuring-compact');
  var compact = {
    title: title.getBoundingClientRect(),
    date: date.getBoundingClientRect(),
    actions: actions.getBoundingClientRect()
  };
  var compactHeight = header.getBoundingClientRect().height;
  var compactTitleSize = parseFloat(getComputedStyle(title).fontSize) || fullTitleSize;
  // The painted title is the full one scaled, so it never ellipsises; make it
  // small enough to fit the room the bar leaves beside the buttons, and keep
  // it centred in that room vertically.
  if (title.scrollWidth > title.clientWidth) {
    compactTitleSize = compactTitleSize * title.clientWidth / title.scrollWidth;
  }
  var compactLineHeight = compact.title.height;
  compact.title = {
    left: compact.title.left,
    top: compact.title.top + (compactLineHeight - full.title.height * compactTitleSize / fullTitleSize) / 2
  };
  var compactDateSize = parseFloat(getComputedStyle(date).fontSize) || fullDateSize;
  header.classList.remove('masthead-measuring-compact');
  if (fittedTitleSize) title.style.fontSize = fittedTitleSize;

  mastheadState.metrics = {
    header: header,
    title: title,
    date: date,
    actions: actions,
    full: full,
    compact: compact,
    fullHeight: fullHeight,
    compactHeight: compactHeight,
    stageHeight: stageHeight,
    titleScale: compactTitleSize / fullTitleSize,
    dateScale: compactDateSize / fullDateSize
  };
  mastheadState.progress = -1;
  syncMastheadNow();
}

function scheduleMastheadMeasure() {
  if (mastheadState.measureFrame !== null) return;
  mastheadState.measureFrame = requestAnimationFrame(measureMasthead);
}

[$('#briefing-page'), $('#reader-page')].forEach(function(page) {
  if (page) page.addEventListener('scroll', scheduleMastheadUpdate, { passive: true });
});

function setInert(element, inert) {
  if (!element) return;
  if (inert) element.setAttribute('inert', '');
  else element.removeAttribute('inert');
}

function clearCurlPresentation() {
  var briefingPage = $('#briefing-page');
  var flap = $('#curl-flap');
  var frontBand = $('#front-shadow-band');
  var readerBand = $('#reader-shadow-band');
  if (briefingPage) {
    briefingPage.style.removeProperty('clip-path');
    briefingPage.style.removeProperty('visibility');
  }
  if (flap) {
    flap.style.removeProperty('display');
    flap.style.removeProperty('clip-path');
    flap.style.removeProperty('transform');
  }
  [frontBand, readerBand, $('#curl-light-band')].forEach(function(band) {
    if (band) band.removeAttribute('style');
  });
}

function cancelCurlAnimation() {
  if (!curlState.animation) return;
  if (curlState.animation.type === 'frame') cancelAnimationFrame(curlState.animation.id);
  else clearTimeout(curlState.animation.id);
  curlState.animation = null;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function curlPolygon(points) {
  if (!points.length) return 'polygon(0 0,0 0,0 0)';
  return 'polygon(' + points.map(function(point) {
    return point[0].toFixed(1) + 'px ' + point[1].toFixed(1) + 'px';
  }).join(',') + ')';
}

function curlBandWidth(value) {
  return Math.max(1, value).toFixed(1) + 'px';
}

function renderCurl() {
  var stage = $('#reading-stage');
  var briefingPage = $('#briefing-page');
  var flap = $('#curl-flap');
  var curlBand = $('#curl-light-band');
  var frontBand = $('#front-shadow-band');
  var readerBand = $('#reader-shadow-band');
  if (!stage || !briefingPage || !flap || prefersReducedMotion()) {
    clearCurlPresentation();
    return;
  }

  if (curlState.progress <= 0.0005) {
    stage.classList.remove('curl-active');
    clearCurlPresentation();
    return;
  }
  stage.classList.add('curl-active');
  if (curlState.progress >= 0.9995) {
    clearCurlPresentation();
    briefingPage.style.visibility = 'hidden';
    return;
  }

  var frame = window.CurlGeometry.curlFrame({
    width: stage.clientWidth,
    height: stage.clientHeight,
    progress: curlState.progress,
    cornerY: curlState.cornerY,
    sign: curlState.sign,
    dragY: curlState.dragY
  });
  var matrix = frame.reflection.matrix;
  var translation = frame.reflection.translation;
  briefingPage.style.visibility = '';
  briefingPage.style.clipPath = curlPolygon(frame.frontPolygon);
  flap.style.display = 'block';
  flap.style.clipPath = curlPolygon(frame.flapPolygon);
  flap.style.transform = 'matrix(' + [
    matrix[0], matrix[1], matrix[2], matrix[3], translation[0], translation[1]
  ].join(',') + ')';
  $('#curl-ghost').scrollTop = briefingPage.scrollTop;

  [curlBand, frontBand, readerBand].forEach(function(band) {
    band.style.left = frame.midpoint[0] + 'px';
    band.style.top = frame.midpoint[1] + 'px';
    band.style.transform = 'rotate(' + frame.creaseAngle + 'deg)';
  });
  var curl = frame.lighting.curl;
  curlBand.style.opacity = '1';
  curlBand.style.background = 'linear-gradient(to right,' +
    'rgba(60,40,20,' + curl.strengths[0] + ') 0px,' +
    'rgba(255,255,255,' + curl.strengths[1] + ') ' + curlBandWidth(curl.widths[1]) + ',' +
    'rgba(255,255,255,' + curl.strengths[2] + ') ' + curlBandWidth(curl.widths[2]) + ',' +
    'rgba(60,40,20,' + curl.strengths[3] + ') ' + curlBandWidth(curl.widths[3]) + ',' +
    'rgba(60,40,20,' + curl.strengths[4] + ') ' + curlBandWidth(curl.widths[4]) + ')';
  frontBand.style.opacity = '1';
  frontBand.style.transform = 'rotate(' + (frame.creaseAngle + 180) + 'deg)';
  frontBand.style.background = 'linear-gradient(to right,rgba(40,25,10,' +
    frame.lighting.crease.strength.toFixed(3) + ') 0px,rgba(40,25,10,0) ' +
    curlBandWidth(frame.lighting.crease.width) + ')';
  readerBand.style.opacity = '1';
  readerBand.style.background = 'linear-gradient(to right,rgba(30,20,10,' +
    frame.lighting.cast.strength.toFixed(3) + ') 0px,rgba(30,20,10,0) ' +
    curlBandWidth(frame.lighting.cast.width) + ')';
}

function refreshCurlGhost() {
  var briefingPage = $('#briefing-page');
  var ghost = $('#curl-ghost');
  if (!briefingPage || !ghost) return;
  var clones = Array.from(briefingPage.childNodes).map(function(node) { return node.cloneNode(true); });
  ghost.replaceChildren.apply(ghost, clones);
  ghost.querySelectorAll('[id]').forEach(function(node) { node.removeAttribute('id'); });
  ghost.querySelectorAll('a').forEach(function(node) {
    node.removeAttribute('href');
    node.removeAttribute('target');
    node.removeAttribute('rel');
    node.setAttribute('tabindex', '-1');
  });
  ghost.querySelectorAll('button,input,select,textarea').forEach(function(node) {
    node.disabled = true;
    node.setAttribute('tabindex', '-1');
    node.removeAttribute('name');
  });
  ghost.querySelectorAll('form').forEach(function(node) {
    node.removeAttribute('action');
    node.removeAttribute('method');
  });
  ghost.scrollTop = briefingPage.scrollTop;
}

function setCurlCorner(pointerY) {
  var corner = window.CurlGeometry.nearestCorner(pointerY, $('#reading-stage').clientHeight);
  curlState.cornerY = corner.cornerY;
  curlState.sign = corner.sign;
}

function animateCurlTo(target, complete) {
  cancelCurlAnimation();
  var from = curlState.progress;
  var fromDragY = curlState.dragY;
  var duration = Math.max(200, 700 * Math.abs(target - from));
  var started = performance.now();

  function step(now) {
    var elapsed = Math.min(1, (now - started) / duration);
    var eased = 1 - Math.pow(1 - elapsed, 3);
    curlState.progress = from + (target - from) * eased;
    curlState.dragY = fromDragY * (1 - eased);
    renderCurl();
    if (elapsed < 1) {
      curlState.animation.id = requestAnimationFrame(step);
    } else {
      curlState.progress = target;
      curlState.dragY = 0;
      curlState.animation = null;
      renderCurl();
      if (complete) complete();
    }
  }

  curlState.animation = { type: 'frame', id: requestAnimationFrame(step) };
}

function clearPreparedReader() {
  if (readingState.readerOpen) return;
  $('#reader-header').replaceChildren();
  $('#reader-body').replaceChildren();
}

function prepareReaderForCurl(key) {
  var item = readingStories.get(String(key));
  if (!item) return false;
  renderReader(item);
  $('#reader-page').scrollTop = 0;
  refreshCurlGhost();
  return true;
}

function completeReaderReturn() {
  if (readingState.alertId) {
    router.navigate('/');
    return;
  }
  if (readingState.appHistoryEntry && history.state && history.state.appHistoryEntry) {
    history.back();
  } else {
    var editionUrl = currentBriefingId ? '/?edition=' + encodeURIComponent(currentBriefingId) : '/';
    history.replaceState({ editionId: currentBriefingId }, '', editionUrl);
    closeReader();
  }
}

function reducedForwardTurn(key) {
  if (!prepareReaderForCurl(key)) return;
  var stage = $('#reading-stage');
  stage.classList.add('curl-active', 'reduced-turning', 'reduced-turning--forward');
  curlState.animation = { type: 'timer', id: setTimeout(function() {
    curlState.animation = null;
    curlState.progress = 1;
    openReaderById(key, true);
    stage.classList.remove('reduced-turning', 'reduced-turning--forward');
  }, 150) };
}

function reducedBackTurn(complete) {
  var stage = $('#reading-stage');
  stage.classList.add('curl-active', 'reduced-turning', 'reduced-turning--back');
  void stage.offsetWidth;
  stage.classList.remove('reader-active');
  curlState.animation = { type: 'timer', id: setTimeout(function() {
    curlState.animation = null;
    curlState.progress = 0;
    stage.classList.remove('reduced-turning', 'reduced-turning--back');
    complete();
  }, 150) };
}

function startForwardTurn(key) {
  if (curlState.animation || readingState.readerOpen) return;
  if (prefersReducedMotion()) {
    reducedForwardTurn(String(key));
    return;
  }
  if (!prepareReaderForCurl(key)) return;
  setCurlCorner($('#reading-stage').clientHeight * 0.8);
  curlState.progress = 0;
  curlState.dragY = 0;
  $('#reading-stage').classList.add('curl-active');
  animateCurlTo(1, function() { openReaderById(String(key), true); });
}

function startBackTurn() {
  if (!readingState.readerOpen || curlState.animation) return;
  if (prefersReducedMotion()) {
    reducedBackTurn(completeReaderReturn);
    return;
  }
  setCurlCorner($('#reading-stage').clientHeight * 0.8);
  curlState.progress = 1;
  curlState.dragY = 0;
  refreshCurlGhost();
  $('#reading-stage').classList.remove('reader-active');
  $('#reading-stage').classList.add('curl-active');
  animateCurlTo(0, completeReaderReturn);
}

function resetReadingStage() {
  cancelCurlAnimation();
  curlState.progress = 0;
  curlState.cornerY = 0;
  curlState.sign = 1;
  curlState.dragY = 0;
  curlState.animation = null;
  curlState.gesture = null;
  clearCurlPresentation();
  stopReaderReadTracking();

  var stage = $('#reading-stage');
  var briefingPage = $('#briefing-page');
  var readerPage = $('#reader-page');
  if (stage) stage.classList.remove('reader-active', 'curl-active', 'reduced-turning', 'reduced-turning--forward', 'reduced-turning--back');
  setInert(briefingPage, false);
  setInert(readerPage, true);
  if (readerPage) readerPage.setAttribute('aria-hidden', 'true');
  if ($('#reader-header')) $('#reader-header').replaceChildren();
  if ($('#reader-body')) $('#reader-body').replaceChildren();
  if ($('#curl-ghost')) $('#curl-ghost').replaceChildren();
  resetThumbIndexInteraction();
  readingState.readerOpen = false;
  readingState.storyId = null;
  readingState.openerId = null;
  readingState.appHistoryEntry = false;
  readingState.alertId = null;
  scheduleMastheadUpdate();
}

function storyKey(item) {
  if (readingStoryKeys.has(item)) return readingStoryKeys.get(item);
  var hasStableId = item && item.id !== undefined && item.id !== null && item.id !== '';
  var key = hasStableId ? String(item.id) : 'legacy-story-' + (++readingFallbackId);
  readingStoryKeys.set(item, key);
  if (!readingStories.has(key)) readingStories.set(key, item);
  return key;
}

function indexReadingStoryKeys(sections) {
  var entries = window.ReadingLogic.storyEntries(sections || []);
  entries.forEach(function(entry) {
    readingStoryKeys.set(entry.item, entry.key);
    if (!readingStories.has(entry.key)) readingStories.set(entry.key, entry.item);
  });
  readingFallbackId = entries.filter(function(entry) {
    return entry.key.indexOf('legacy-story-') === 0;
  }).length;
}

function sectionFallbackId(section) {
  var title = section && section.title ? section.title : 'section';
  var fallback = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return fallback || 'section';
}

function isTopReadingSection(section) {
  return section && (section.id === 'top' || (!section.id && sectionFallbackId(section) === 'you-should-know'));
}

function readingTimeText(value) {
  if (value === undefined || value === null || value === '') return '';
  var text = String(value);
  return /read$/i.test(text) ? text : text + ' min read';
}

function formatAlertedTime(value) {
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

function sourceNames(item) {
  var names = window.ReadingLogic.parseSources(item && item.sources).map(function(source) {
    return typeof source === 'string' ? source : source && source.name;
  }).filter(Boolean);
  [item && item.source, item && item.source_name].forEach(function(name) {
    if (name && names.indexOf(name) === -1) names.push(name);
  });
  return names;
}

var SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
var SECTION_ICON_SHAPES = {
  top: [
    ['rect', { x: '4', y: '3.5', width: '16', height: '17', rx: '1.5' }],
    ['path', { d: 'M7.5 7.5h9M7.5 11h4M7.5 14.5h4M7.5 17.5h9' }],
    ['rect', { x: '13.5', y: '10.5', width: '3', height: '4.5', fill: 'currentColor', stroke: 'none' }]
  ],
  tasmania: [
    ['path', { fill: 'currentColor', 'fill-opacity': '.18', d: 'M2.3 1.5 L5.5 1.9 L11.1 4.9 L13.5 4.0 L16.6 3.6 L19.8 1.9 L21.7 3.6 L21.4 5.9 L21.4 9.9 L21.4 12.6 L20.4 15.4 L19.6 19.4 L16.1 17.9 L14.5 21.5 L13.5 22.5 L9.2 22.1 L8.7 20.1 L5.0 12.2 L5.5 11.9 L3.4 8.3 L2.3 6.5 Z' }]
  ],
  australia: [
    ['path', { fill: 'currentColor', 'fill-opacity': '.18', d: 'M1.5 11.4 L1.9 8.9 L4.3 8.0 L6.2 6.7 L7.6 4.6 L8.6 4.2 L9.7 4.9 L10.6 3.4 L11.8 2.7 L13.8 3.3 L13.2 4.9 L15.4 6.4 L16.3 3.5 L16.7 2.4 L18.2 5.2 L18.4 6.1 L19.0 7.4 L20.2 8.5 L21.0 9.8 L22.3 12.2 L22.5 12.8 L21.6 15.4 L21.3 15.9 L20.6 17.8 L20.6 18.0 L18.8 19.0 L18.0 18.4 L16.3 18.6 L15.3 17.9 L14.1 16.9 L14.3 15.1 L13.1 16.5 L12.2 14.9 L10.2 14.6 L9.7 14.6 L6.0 15.9 L3.9 16.6 L2.5 16.2 L2.8 14.8 L2.2 13.0 Z' }],
    ['path', { fill: 'currentColor', stroke: 'none', d: 'M17.9 19.9 L18.8 20.1 L19.8 20.1 L19.7 20.8 L19.2 21.5 L18.5 21.6 L18.0 20.5 Z' }]
  ],
  world: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['g', { fill: 'currentColor', 'fill-opacity': '.55', stroke: 'none' }, [
      ['path', { d: 'M5.2 8.4C6.6 5.9 9.4 4.4 12.4 4.3c2.6 0 4.9 1 6.3 2.8l-1.4 1.6-1.9-.5-1.3 1.7-1.6-.6-1.5 1.5-1.4-1-1.6 1.1-1.4-1.2-1.6.4z' }],
      ['path', { d: 'M10.5 11.1l1.7-.1-.8 2.4z' }],
      ['ellipse', { cx: '14.4', cy: '12.7', rx: '.9', ry: '.45' }],
      ['ellipse', { cx: '16.2', cy: '13.3', rx: '1', ry: '.45' }],
      ['path', { d: 'M13.9 15.3c1-.8 2.8-.8 3.8 0 .8.8.6 2.3-.6 2.9-1.2.6-2.6.2-3.2-.8-.4-.7-.4-1.5 0-2.1z' }],
      ['path', { d: 'M3.6 12.3c1.1-.6 2.6-.2 3.2 1.2.4 1.5-.3 3.3-1.5 4.1-.9-1.5-1.5-3.2-1.7-5.3z' }]
    ]]
  ],
  tech: [
    ['path', { d: 'M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z' }],
    ['path', { d: 'M8.8 12.2l2.2 2.2 4.3-4.6' }]
  ],
  homelab: [
    ['rect', { x: '4', y: '3.5', width: '16', height: '5', rx: '1' }],
    ['rect', { x: '4', y: '9.5', width: '16', height: '5', rx: '1' }],
    ['rect', { x: '4', y: '15.5', width: '16', height: '5', rx: '1' }],
    ['path', { d: 'M7 6h.01M7 12h.01M7 18h.01M11 6h6M11 12h6M11 18h6' }]
  ],
  gaming: [
    ['path', { d: 'M7 8h10a4 4 0 0 1 3.9 4.9l-1 4.3a2.2 2.2 0 0 1-3.8.9L14 16h-4l-2.1 2.1a2.2 2.2 0 0 1-3.8-.9l-1-4.3A4 4 0 0 1 7 8z' }],
    ['path', { d: 'M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01' }]
  ],
  sport: [
    ['path', { d: 'M8 4h8v3.2c0 3.1-1.5 5.5-4 6.8-2.5-1.3-4-3.7-4-6.8z' }],
    ['path', { d: 'M8 6H4.5v1.5c0 2.3 1.5 4 4 4.5M16 6h3.5v1.5c0 2.3-1.5 4-4 4.5M12 14v3M8.5 20h7M10 17h4' }]
  ],
  internet: [
    ['path', { d: 'M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17H4a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 4 5.5z' }],
    ['path', { d: 'M7 10h10M7 13h6' }]
  ]
};

function appendSectionIconShape(parent, definition) {
  var node = document.createElementNS(SVG_NAMESPACE, definition[0]);
  Object.keys(definition[1]).forEach(function(name) { node.setAttribute(name, definition[1][name]); });
  (definition[2] || []).forEach(function(child) { appendSectionIconShape(node, child); });
  parent.appendChild(node);
}

function sectionIcon(sectionId, className) {
  var wrapper = el('span', { className: className });
  var svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  var shapes = SECTION_ICON_SHAPES[window.ThumbIndexLogic.sectionIconId(sectionId)];
  shapes.forEach(function(shape) { appendSectionIconShape(svg, shape); });
  wrapper.appendChild(svg);
  return wrapper;
}

function cancelThumbIndexFrame() {
  if (thumbIndexState.frame !== null) cancelAnimationFrame(thumbIndexState.frame);
  thumbIndexState.frame = null;
  thumbIndexState.lastFrame = 0;
}

function cancelThumbIndexGlide() {
  if (thumbIndexState.glide !== null) cancelAnimationFrame(thumbIndexState.glide);
  thumbIndexState.glide = null;
}

function setThumbIndexPick(story) {
  if (thumbIndexState.picking === story) return;
  if (thumbIndexState.picking) thumbIndexState.picking.classList.remove('thumb-target');
  thumbIndexState.picking = story;
  if (story) {
    story.classList.add('thumb-target');
    thumbIndexTick();
  }
}

function resetThumbIndexInteraction() {
  cancelThumbIndexFrame();
  cancelThumbIndexGlide();
  if (thumbIndexState.hereFrame !== null) cancelAnimationFrame(thumbIndexState.hereFrame);
  thumbIndexState.hereFrame = null;
  setThumbIndexPick(null);
  thumbIndexState.finger = null;
  thumbIndexState.current = -1;
  thumbIndexState.labels.forEach(function(label) {
    label.x = 0;
    label.vx = 0;
    label.s = 1;
    label.vs = 0;
    label.el.classList.remove('is-current');
    applyThumbLabelTransform(label);
  });
  var layer = $('#section-thumb-layer');
  if (layer) {
    setInert(layer, false);
    layer.removeAttribute('aria-hidden');
  }
  if ($('#section-thumb-pill')) $('#section-thumb-pill').classList.remove('is-visible');
  if ($('#section-thumb-pickline')) $('#section-thumb-pickline').classList.remove('is-visible');
}

function resetThumbIndex() {
  resetThumbIndexInteraction();
  thumbIndexState.labels = [];
  thumbIndexState.sections = [];
  thumbIndexState.here = 0;
  var index = $('#section-thumb-index');
  var layer = $('#section-thumb-layer');
  if (index) {
    index.replaceChildren();
    index.setAttribute('aria-valuemax', '0');
    index.setAttribute('aria-valuenow', '0');
    index.removeAttribute('aria-valuetext');
  }
  if (layer) layer.hidden = true;
}

function applyThumbLabelTransform(label) {
  label.el.style.transform = 'translate(' + label.x.toFixed(2) + 'px,' +
    (label.y - 9).toFixed(2) + 'px) scale(' + label.s.toFixed(3) + ')';
}

function layoutThumbIndex(stageHeight) {
  if (!thumbIndexState.labels.length) return;
  var height = Number.isFinite(stageHeight) ? stageHeight : $('#reading-stage').clientHeight;
  var positions = window.ThumbIndexLogic.labelLayout(height, thumbIndexState.labels.length);
  thumbIndexState.labels.forEach(function(label, index) {
    label.y = positions[index];
    applyThumbLabelTransform(label);
  });
}

function renderThumbIndexFrame(timestamp) {
  var reduced = prefersReducedMotion();
  var dt = thumbIndexState.lastFrame
    ? Math.min(48, timestamp - thumbIndexState.lastFrame) / 16.67
    : 1;
  thumbIndexState.lastFrame = timestamp;
  var moving = false;

  thumbIndexState.labels.forEach(function(label, index) {
    var target = thumbIndexState.finger
      ? window.ThumbIndexLogic.bowScaleTargets({
        labelY: label.y,
        fingerY: thumbIndexState.finger.y,
        picking: Boolean(thumbIndexState.picking),
        reducedMotion: reduced
      })
      : { x: 0, scale: 1 };
    if (reduced) {
      label.x = target.x;
      label.s = target.scale;
      label.vx = 0;
      label.vs = 0;
    } else {
      var stiffness = thumbIndexState.finger ? 0.32 : 0.16;
      var damping = thumbIndexState.finger ? 0.62 : 0.30;
      label.vx += ((target.x - label.x) * stiffness - label.vx * damping) * dt;
      label.vs += ((target.scale - label.s) * stiffness - label.vs * damping) * dt;
      label.x += label.vx * dt;
      label.s += label.vs * dt;
    }
    if (Math.abs(label.vx) > 0.01 || Math.abs(target.x - label.x) > 0.05 ||
        Math.abs(target.scale - label.s) > 0.002) moving = true;
    applyThumbLabelTransform(label);
    label.el.classList.toggle('is-current', Boolean(thumbIndexState.finger) && index === thumbIndexState.current);
  });

  var pill = $('#section-thumb-pill');
  var currentLabel = thumbIndexState.labels[thumbIndexState.current];
  var showPill = Boolean(thumbIndexState.finger) && !thumbIndexState.picking && Boolean(currentLabel);
  if (showPill) {
    pill.style.top = currentLabel.y + 'px';
    pill.style.transform = 'translate(' + window.ThumbIndexLogic.pillOffset({
      iconX: currentLabel.x,
      iconScale: currentLabel.s
    }).toFixed(2) + 'px,-50%)';
  }
  pill.classList.toggle('is-visible', showPill);

  if (moving || (thumbIndexState.finger && !reduced)) {
    thumbIndexState.frame = requestAnimationFrame(renderThumbIndexFrame);
  } else {
    thumbIndexState.frame = null;
    thumbIndexState.lastFrame = 0;
  }
}

function kickThumbIndex() {
  if (thumbIndexState.frame !== null) return;
  thumbIndexState.lastFrame = 0;
  thumbIndexState.frame = requestAnimationFrame(renderThumbIndexFrame);
}

function thumbIndexTick() {
  try { if (navigator.vibrate) navigator.vibrate(5); }
  catch (_) { /* vibration is optional */ }
}

function thumbSectionTop(index) {
  if (index === 0) return 0;
  return Math.max(0, thumbIndexState.sections[index].el.offsetTop - 2);
}

function jumpToThumbSection(index) {
  var page = $('#briefing-page');
  var target = thumbSectionTop(index);
  cancelThumbIndexGlide();
  if (prefersReducedMotion()) {
    page.scrollTop = target;
    return;
  }
  var start = page.scrollTop;
  var started = null;
  function step(timestamp) {
    if (started === null) started = timestamp;
    var progress = Math.min(1, (timestamp - started) / 150);
    page.scrollTop = start + (target - start) * (1 - Math.pow(1 - progress, 3));
    if (progress < 1) thumbIndexState.glide = requestAnimationFrame(step);
    else thumbIndexState.glide = null;
  }
  thumbIndexState.glide = requestAnimationFrame(step);
}

function selectThumbSection(index) {
  if (index < 0 || index >= thumbIndexState.sections.length || index === thumbIndexState.current) return;
  thumbIndexState.current = index;
  var section = thumbIndexState.sections[index];
  var slider = $('#section-thumb-index');
  slider.setAttribute('aria-valuenow', String(index));
  slider.setAttribute('aria-valuetext', section.title);
  $('#section-thumb-pill').textContent = section.title;
  thumbIndexTick();
  jumpToThumbSection(index);
}

function syncThumbIndexHere() {
  if (!thumbIndexState.sections.length || thumbIndexState.finger) return;
  var pageTop = $('#briefing-page').scrollTop + 8;
  var here = 0;
  var closestTop = -Infinity;
  thumbIndexState.sections.forEach(function(section, index) {
    var top = section.el.offsetTop;
    if (top <= pageTop && top > closestTop) {
      closestTop = top;
      here = index;
    }
  });
  thumbIndexState.here = here;
  thumbIndexState.labels.forEach(function(label, index) {
    label.el.classList.toggle('is-here', index === here);
  });
}

function scheduleThumbIndexHere() {
  if (thumbIndexState.hereFrame !== null) return;
  thumbIndexState.hereFrame = requestAnimationFrame(function() {
    thumbIndexState.hereFrame = null;
    syncThumbIndexHere();
  });
}

function renderThumbIndex(sections) {
  resetThumbIndex();
  if (!sections.length) return;
  var layer = $('#section-thumb-layer');
  var index = $('#section-thumb-index');
  thumbIndexState.sections = sections;
  thumbIndexState.labels = sections.map(function(section) {
    var icon = sectionIcon(section.id, 'section-thumb-label');
    index.appendChild(icon);
    return { el: icon, y: 0, x: 0, vx: 0, s: 1, vs: 0 };
  });
  index.setAttribute('aria-valuemax', String(sections.length - 1));
  index.setAttribute('aria-valuenow', '0');
  index.setAttribute('aria-valuetext', sections[0].title);
  layer.hidden = false;
  layoutThumbIndex();
  syncThumbIndexHere();
}

function thumbStoryAt(x, y) {
  var stageRect = $('#reading-stage').getBoundingClientRect();
  var stories = $$('#briefing-page .reading-story');
  for (var index = 0; index < stories.length; index++) {
    var bounds = stories[index].getBoundingClientRect();
    if (y >= bounds.top && y <= bounds.bottom && x >= stageRect.left && x <= bounds.right + 40) {
      return stories[index];
    }
  }
  return null;
}

function onThumbPointerDown(event) {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || readingState.readerOpen) return;
  var stageRect = $('#reading-stage').getBoundingClientRect();
  event.currentTarget.setPointerCapture(event.pointerId);
  thumbIndexState.finger = {
    pointerId: event.pointerId,
    y: Math.max(0, Math.min(stageRect.height, event.clientY - stageRect.top)),
    x0: event.clientX
  };
  thumbIndexState.current = -1;
  selectThumbSection(window.ThumbIndexLogic.nearestSection(
    thumbIndexState.finger.y,
    thumbIndexState.labels.map(function(label) { return label.y; })
  ));
  kickThumbIndex();
  event.preventDefault();
}

function onThumbPointerMove(event) {
  var finger = thumbIndexState.finger;
  if (!finger || finger.pointerId !== event.pointerId) return;
  var stageRect = $('#reading-stage').getBoundingClientRect();
  finger.y = Math.max(0, Math.min(stageRect.height, event.clientY - stageRect.top));
  var away = -(event.clientX - finger.x0);
  var pickline = $('#section-thumb-pickline');
  if (away > 36) {
    setThumbIndexPick(thumbStoryAt(event.clientX, event.clientY));
    pickline.style.top = finger.y + 'px';
    pickline.classList.add('is-visible');
  } else {
    setThumbIndexPick(null);
    pickline.classList.remove('is-visible');
    selectThumbSection(window.ThumbIndexLogic.nearestSection(
      finger.y,
      thumbIndexState.labels.map(function(label) { return label.y; })
    ));
  }
  kickThumbIndex();
  event.preventDefault();
}

function releaseThumbIndex(event, cancelled) {
  var finger = thumbIndexState.finger;
  if (!finger || finger.pointerId !== event.pointerId) return;
  var picked = thumbIndexState.picking;
  thumbIndexState.finger = null;
  $('#section-thumb-pickline').classList.remove('is-visible');
  setThumbIndexPick(null);
  if (!cancelled && picked) startForwardTurn(picked.dataset.storyId);
  kickThumbIndex();
}

function onThumbKeyDown(event) {
  if (!thumbIndexState.sections.length) return;
  var index = thumbIndexState.current < 0 ? thumbIndexState.here : thumbIndexState.current;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    index = Math.min(thumbIndexState.sections.length - 1, index + 1);
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    index = Math.max(0, index - 1);
  } else {
    return;
  }
  event.preventDefault();
  thumbIndexState.current = -1;
  selectThumbSection(index);
  syncThumbIndexHere();
}

$('#section-thumb-index').addEventListener('pointerdown', onThumbPointerDown);
$('#section-thumb-index').addEventListener('pointermove', onThumbPointerMove, { passive: false });
$('#section-thumb-index').addEventListener('pointerup', function(event) { releaseThumbIndex(event, false); });
$('#section-thumb-index').addEventListener('pointercancel', function(event) { releaseThumbIndex(event, true); });
$('#section-thumb-index').addEventListener('keydown', onThumbKeyDown);
$('#briefing-page').addEventListener('scroll', scheduleThumbIndexHere, { passive: true });

// ============================================================
// 5. Paper briefing rendering
// ============================================================

function syncEditionLayout() {
  if (!window.EditionLayout) return;
  var layout = window.EditionLayout.layoutForWidth(window.innerWidth);
  var app = $('#app');
  if (!app) return;
  app.style.setProperty('--paper-side-margin', layout.sideMargin + 'px');
  app.style.setProperty('--reading-columns', String(layout.columns));
  app.style.setProperty('--reading-pair-columns', String(layout.pairedColumns));
  var split = window.EditionLayout.topSplit(layout.columns, Number(app.dataset.topRest || 0));
  app.style.setProperty('--reading-top-rest-columns', String(split.restColumns));
  app.style.setProperty('--reading-lead-span', String(split.leadSpan));
}

async function loadBriefing(id) {
  var hasId = id !== undefined && id !== null && id !== '';
  var target = hasId ? String(id) : 'latest';
  if (briefingLoadTarget === target) return;
  briefingLoadTarget = target;
  var loadSequence = ++briefingLoadSequence;
  var url = hasId ? '/api/briefing/' + encodeURIComponent(id) : '/api/briefing';
  var loading = $('#loading');
  var emptyState = $('#empty-state');
  var container = $('#sections-container');

  resetReadingStage();
  stopStorySeenObserver();
  resetThumbIndex();
  $('#briefing-page').scrollTop = 0;
  readingState.briefingScrollTop = 0;
  briefingLoaded = false;
  readingStories.clear();
  readingStoryKeys.clear();
  readingStoryOpeners.clear();
  readingFallbackId = 0;
  container.replaceChildren();
  loading.classList.remove('hidden');
  emptyState.classList.add('hidden');

  try {
    var res = await fetch(url);
    var json = await res.json();
    if (loadSequence !== briefingLoadSequence) return;
    loading.classList.add('hidden');

    if (!json.data || json.error) {
      currentDate = null;
      currentBriefingId = null;
      currentBriefingIsLatest = false;
      emptyState.classList.remove('hidden');
      $('#briefing-date').textContent = '';
      $('#briefing-headline').textContent = '';
      briefingLoaded = true;
      syncReaderFromLocation();
      return;
    }

    currentDate = json.date;
    currentBriefingId = json.id;
    currentBriefingIsLatest = Boolean(json.is_latest);
    var briefing = json.data;

    indexReadingStoryKeys(briefing.sections);

    $('#briefing-date').textContent = formatDate(json.date);
    $('#briefing-headline').textContent = '';
    scheduleMastheadMeasure();
    document.title = formatDate(json.date) + ' \u2014 ' + appTitle;

    $$('.archive-edition').forEach(function(archiveItem) {
      archiveItem.classList.toggle('current', archiveItem.dataset.id === String(json.id));
    });

    updateEditionNotice();

    syncEditionLayout();
    var thumbSections = [];
    var prepared = window.ReadingLogic.prepareSections(briefing.sections || []).filter(function(group) {
      return group.shown.length > 0 || group.hidden.length > 0;
    });
    window.EditionLayout.planSectionBands(prepared).forEach(function(band) {
      var renderedBand = renderReadingBand(band);
      container.appendChild(renderedBand.node);
      renderedBand.sections.forEach(function(renderedSection) {
        var section = renderedSection.group.section;
        var topSection = isTopReadingSection(section);
        thumbSections.push({
          el: renderedSection.node,
          id: section.id || sectionFallbackId(section),
          title: topSection ? 'You should know' : (section.title || 'News')
        });
      });
    });
    renderThumbIndex(thumbSections);
    startStorySeenObserver();
    refreshCurlGhost();
    briefingLoaded = true;
    syncReaderFromLocation();
  } catch (err) {
    if (loadSequence !== briefingLoadSequence) return;
    loading.classList.add('hidden');
    emptyState.classList.remove('hidden');
    briefingLoaded = true;
    syncReaderFromLocation();
    console.error('Failed to load briefing:', err);
  } finally {
    if (loadSequence === briefingLoadSequence) briefingLoadTarget = null;
  }
}

function updateEditionNotice() {
  var notice = $('#edition-notice');
  if (!notice) return;
  var older = Boolean(currentBriefingId && !currentBriefingIsLatest);
  notice.classList.toggle('hidden', !older);
  $('#edition-notice-text').textContent = older ? 'Edition of ' + formatDate(currentDate) : '';
  scheduleMastheadMeasure();
}

function requestedEditionId() {
  if (location.pathname !== '/') return null;
  var value = new URLSearchParams(location.search).get('edition');
  return value && /^\d+$/.test(value) ? value : null;
}

function loadReadingFromLocation() {
  if (location.pathname !== '/') return;
  var alertId = requestedAlertId();
  if (alertId) {
    loadAlert(alertId);
    return;
  }
  var id = requestedEditionId();
  var alreadyLoaded = briefingLoaded && (id
    ? String(currentBriefingId) === String(id)
    : currentBriefingIsLatest);
  if (alreadyLoaded) {
    syncReaderFromLocation();
    return;
  }
  loadBriefing(id || undefined);
}

function requestedAlertId() {
  if (location.pathname !== '/') return null;
  var value = new URLSearchParams(location.search).get('alert');
  return value && /^\d+$/.test(value) ? value : null;
}

async function loadAlert(id) {
  if (alertLoadTarget === String(id) || (readingState.alertId && String(readingState.alertId) === String(id))) return;
  alertLoadTarget = String(id);
  var loading = $('#loading');
  var emptyState = $('#empty-state');
  resetReadingStage();
  stopStorySeenObserver();
  resetThumbIndex();
  readingStories.clear();
  readingStoryKeys.clear();
  readingStoryOpeners.clear();
  briefingLoaded = false;
  $('#sections-container').replaceChildren();
  loading.classList.remove('hidden');
  emptyState.classList.add('hidden');
  try {
    var response = await fetch('/api/alerts/' + encodeURIComponent(id));
    var result = await response.json();
    loading.classList.add('hidden');
    if (!response.ok || !result.alert) throw new Error(result.error || 'Alert not found');
    var alert = result.alert;
    currentDate = null;
    currentBriefingId = null;
    currentBriefingIsLatest = false;
    $('#briefing-date').textContent = 'Urgent alert';
    updateEditionNotice();
    briefingLoaded = true;
    showReader({
      title: alert.headline,
      kicker: alert.kicker,
      summary: alert.summary,
      source_name: alert.source_name,
      article_url: alert.original_url,
      canonical_url: alert.canonical_url,
      alert_reason: alert.reason,
      alerted_at: alert.sent_at
    }, 'alert-' + alert.id, false);
    readingState.alertId = String(alert.id);
    document.title = alert.headline + ' — The Daily Gump';
  } catch (error) {
    loading.classList.add('hidden');
    emptyState.classList.remove('hidden');
    $('#briefing-date').textContent = '';
    console.error('Failed to load alert:', error);
  } finally {
    alertLoadTarget = null;
  }
}

function renderReadingBand(band) {
  var bandEl = el('div', {
    className: 'reading-band' + (band.shared ? ' reading-band--shared' : '')
  });
  var rendered = band.sections.map(function(group) {
    var sectionNode = renderReadingSection(group);
    bandEl.appendChild(sectionNode);
    return { group: group, node: sectionNode };
  });
  return { node: bandEl, sections: rendered };
}

function renderReadingSection(group) {
  var section = group.section;
  var sectionId = section.id || sectionFallbackId(section);
  var isTop = isTopReadingSection(section);
  var sectionEl = el('section', {
    className: 'reading-section' + (isTop ? ' reading-section--top' : ''),
    'data-section-id': sectionId
  });
  var title = isTop ? 'You should know' : (section.title || 'News');
  var heading = el('h2', { className: 'reading-section-label' });
  heading.appendChild(sectionIcon(sectionId, 'reading-section-icon'));
  heading.appendChild(document.createTextNode(title));
  sectionEl.appendChild(heading);

  var shownList = el('div', { className: 'reading-story-list' });
  var pictureIndex = window.EditionLayout.frontPagePictureIndex(group.shown, isTop);
  if (isTop && group.shown.length) {
    storyKey(group.shown[0]);
    shownList.appendChild(renderReadingStory(group.shown[0], true, pictureIndex === 0));
    var remainder = el('div', { className: 'reading-top-rest' });
    group.shown.slice(1).forEach(function(item) {
      storyKey(item);
      remainder.appendChild(renderReadingStory(item, false, false));
    });
    shownList.appendChild(remainder);
    var appEl = $('#app');
    if (appEl) appEl.dataset.topRest = String(group.shown.length - 1);
    syncEditionLayout();
  } else {
    group.shown.forEach(function(item, index) {
      storyKey(item);
      shownList.appendChild(renderReadingStory(item, false, pictureIndex === index));
    });
  }
  sectionEl.appendChild(shownList);
  return sectionEl;
}

function renderFrontPagePicture(item, lead) {
  var url = safeUrl(window.EditionLayout.storyImageUrl(item));
  if (!url) return null;
  var frame = el('span', {
    className: 'reading-story-picture' + (lead ? ' reading-story-picture--lead' : ' reading-story-picture--section')
  });
  var image = el('img', {
    src: url,
    alt: item.image_alt || '',
    loading: 'lazy',
    decoding: 'async'
  });
  image.addEventListener('error', function() { frame.remove(); });
  frame.appendChild(image);
  return frame;
}

function renderToldMini(told, panel) {
  var subjects = window.ToldScale.layoutSubjects(told && told.subjects);
  var dots = subjects.length ? subjects[0].dots : [];
  var scale = el('span', { className: 'told-mini-scale', 'aria-hidden': 'true' });
  scale.appendChild(el('span', { className: 'told-mini-scale-track' }));
  dots.forEach(function(dot) {
    scale.appendChild(el('i', {
      className: 'told-mini-scale-dot told-mini-scale-dot--' + dot.stance,
      style: { insetInlineStart: dot.position + '%' }
    }));
  });
  return el('span', { className: 'reading-story-told-mark' }, [
    scale,
    el('span', {
      textContent: 'Told differently \u00b7 ' + panel.outletCount +
        (panel.outletCount === 1 ? ' outlet' : ' outlets')
    })
  ]);
}

function setToldQuote(section, button, dot, quoteBox) {
  section.querySelectorAll('.told-scale-dot').forEach(function(candidate) {
    candidate.setAttribute('aria-pressed', candidate === button ? 'true' : 'false');
  });
  var outletNames = dot.outlets.join(' \u00b7 ');
  var contents = [el('b', {
    className: 'how-told-quote-label',
    textContent: outletNames + ' \u00b7 ' + dot.displayStance
  })];
  if (dot.stance === 'plain' && !dot.quote) {
    contents.push(el('span', { textContent: 'Reported it plainly.' }));
  } else {
    contents.push(el('span', { className: 'how-told-quote-text', textContent: dot.quote }));
  }
  quoteBox.replaceChildren.apply(quoteBox, contents);
}

function renderToldScaleSubject(subject, section, quoteBox) {
  var subjectEl = el('div', { className: 'how-told-subject' });
  subjectEl.appendChild(el('h4', { textContent: subject.name }));
  var scale = el('div', {
    className: 'told-scale',
    role: 'group',
    'aria-label': subject.name + ': where each outlet sits'
  });
  scale.appendChild(el('div', { className: 'told-scale-track', 'aria-hidden': 'true' }));
  [0, 50, 100].forEach(function(position) {
    scale.appendChild(el('i', {
      className: 'told-scale-tick',
      'aria-hidden': 'true',
      style: { insetInlineStart: position + '%' }
    }));
  });
  subject.dots.forEach(function(dot) {
    var grouped = dot.outlets.length > 1;
    var edgeClass = dot.position <= 10
      ? ' told-scale-dot--edge-start'
      : (dot.position >= 90 ? ' told-scale-dot--edge-end' : '');
    var button = el('button', {
      type: 'button',
      className: 'told-scale-dot told-scale-dot--' + dot.stance +
        (grouped ? ' told-scale-dot--grouped' : '') + edgeClass,
      'aria-label': dot.outlets.join(' \u00b7 ') + ': ' + dot.displayStance,
      'aria-pressed': 'false',
      style: { insetInlineStart: dot.position + '%' }
    }, [
      el('i', {
        className: 'told-scale-dot-mark',
        'aria-hidden': 'true',
        textContent: grouped ? String(dot.outlets.length) : ''
      }),
      el('span', {
        className: 'told-scale-dot-label' + (dot.labelRow ? ' told-scale-dot-label--staggered' : ''),
        textContent: dot.label
      })
    ]);
    button.addEventListener('click', function() {
      setToldQuote(section, button, dot, quoteBox);
    });
    scale.appendChild(button);
  });
  subjectEl.appendChild(scale);
  subjectEl.appendChild(el('div', { className: 'told-scale-ends', 'aria-hidden': 'true' }, [
    el('span', { className: 'told-scale-against', textContent: 'Against' }),
    el('span', { textContent: 'Plain' }),
    el('span', { className: 'told-scale-for', textContent: 'For' })
  ]));
  return subjectEl;
}

function renderToldPanel(told) {
  var panel = window.EditionLayout.prepareToldPanel(told);
  var subjects = window.ToldScale.layoutSubjects(told && told.subjects);
  var section = el('section', {
    className: 'how-told',
    'aria-label': 'How it was told'
  });
  section.appendChild(el('div', { className: 'how-told-heading' }, [
    el('h3', { textContent: 'How it was told' }),
    el('span', {
      className: 'how-told-count',
      textContent: panel.outletCount + (panel.outletCount === 1 ? ' outlet' : ' outlets')
    })
  ]));

  if (panel.sameWay) {
    section.appendChild(el('p', { className: 'how-told-same', textContent: 'Told much the same way.' }));
  }

  var quoteBox = el('div', { className: 'how-told-quote-box', 'aria-live': 'polite' }, [
    el('span', { className: 'how-told-muted', textContent: 'Tap a dot to see that outlet\'s words.' })
  ]);
  subjects.forEach(function(subject) {
    section.appendChild(renderToldScaleSubject(subject, section, quoteBox));
  });
  if (subjects.length) section.appendChild(quoteBox);

  var headlines = el('div', { className: 'how-told-headlines' });
  headlines.appendChild(el('h4', { textContent: 'Headlines' }));
  var headlineList = el('ul');
  panel.headlines.forEach(function(outlet) {
    var row = el('li');
    var url = safeUrl(outlet.url);
    row.appendChild(url ? el('a', {
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
      textContent: outlet.name
    }) : el('span', { textContent: outlet.name }));
    if (outlet.headline) row.appendChild(document.createTextNode(': \u201c' + outlet.headline + '\u201d'));
    headlineList.appendChild(row);
  });
  headlines.appendChild(headlineList);
  section.appendChild(headlines);
  return section;
}

function renderReadingStory(item, lead, showPicture) {
  var key = storyKey(item);
  var picture = showPicture ? renderFrontPagePicture(item, lead) : null;
  var toldPanel = item.told ? window.EditionLayout.prepareToldPanel(item.told) : null;
  var story = el('article', {
    className: 'reading-story' + (lead ? ' reading-story--lead' : '') +
      (picture ? ' reading-story--pictured' : '') +
      (lead && !picture ? ' reading-story--lead-type' : ''),
    'data-story-id': key
  });
  var summaryChildren = [];
  if (picture) summaryChildren.push(picture);
  if (item.kicker) summaryChildren.push(el('span', { className: 'reading-story-kicker', textContent: item.kicker }));
  if (toldPanel && toldPanel.differs) {
    summaryChildren.push(renderToldMini(item.told, toldPanel));
  }
  summaryChildren.push(el('span', { className: 'reading-story-title', textContent: item.title || 'Untitled story' }));
  if (item.summary) summaryChildren.push(el('span', { className: 'reading-story-summary', textContent: item.summary }));
  if (item.alerted_at) summaryChildren.push(el('span', {
    className: 'reading-story-alerted', textContent: 'Alerted ' + formatAlertedTime(item.alerted_at)
  }));
  var opener = el('button', {
    type: 'button',
    className: 'reading-story-open',
    'data-reading-action': 'read',
    'data-story-id': key
  }, summaryChildren);
  if (!readingStoryOpeners.has(key)) readingStoryOpeners.set(key, opener);
  story.appendChild(opener);
  return story;
}

$('#briefing-page').addEventListener('click', function(event) {
  var button = event.target.closest('button[data-reading-action]');
  if (!button || !event.currentTarget.contains(button)) return;
  startForwardTurn(button.dataset.storyId);
});

// ============================================================
// 5b. Full article reader and history
// ============================================================

function firstSafeSourceUrl(item) {
  var sources = window.ReadingLogic.parseSources(item && item.sources);
  for (var index = 0; index < sources.length; index++) {
    var sourceUrl = typeof sources[index] === 'object' && sources[index] ? sources[index].url : '';
    var safe = safeUrl(sourceUrl);
    if (safe) return safe;
  }
  return '';
}

function originalUrl(item) {
  return safeUrl(item && item.article_url) || safeUrl(item && item.canonical_url) ||
    safeUrl(item && item.url) || firstSafeSourceUrl(item);
}

function originalSiteName(item, url) {
  var names = sourceNames(item);
  if (names.length) return names[0];
  if (url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (_) { /* use the plain fallback */ }
  }
  return 'original site';
}

function renderReader(item) {
  var header = $('#reader-header');
  var body = $('#reader-body');
  header.replaceChildren();
  body.replaceChildren();

  if (item.kicker) header.appendChild(el('p', { className: 'reader-kicker', textContent: item.kicker }));
  header.appendChild(el('h2', { className: 'reader-title', id: 'reader-title', tabindex: '-1', textContent: item.title || 'Untitled story' }));
  var metadata = [];
  var names = sourceNames(item);
  if (names.length) metadata.push(names[0]);
  if (item.byline) metadata.push(item.byline);
  var time = readingTimeText(item.reading_time);
  if (time) metadata.push(time);
  if (metadata.length) header.appendChild(el('p', { className: 'reader-byline', textContent: metadata.join(' · ') }));
  if (item.alerted_at) header.appendChild(el('p', {
    className: 'reader-alerted', textContent: 'Alerted ' + formatAlertedTime(item.alerted_at)
  }));

  var readerImages = window.EditionLayout.readerImageUrls(item).map(safeUrl).filter(Boolean);
  if (readerImages.length) {
    var gallery = el('div', {
      className: 'reader-gallery' + (readerImages.length > 1 ? ' reader-gallery--multiple' : '')
    });
    readerImages.forEach(function(url, index) {
      var link = el('a', {
        className: 'reader-image-link',
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': 'Open photo ' + (index + 1) + ' full size'
      });
      var image = el('img', {
        className: 'reader-hero',
        src: url,
        alt: item.image_alt || '',
        loading: index === 0 ? 'eager' : 'lazy',
        decoding: 'async'
      });
      image.addEventListener('error', function() { link.remove(); });
      link.appendChild(image);
      gallery.appendChild(link);
    });
    body.appendChild(gallery);
  }

  if (item.told && item.summary) {
    body.appendChild(el('p', { className: 'reader-summary', textContent: item.summary }));
  }
  if (item.told) body.appendChild(renderToldPanel(item.told));
  if (item.alert_reason) body.appendChild(el('p', {
    className: 'reader-alert-reason', textContent: 'Why now: ' + item.alert_reason
  }));

  var hasArticle = false;
  if (typeof item.article_html === 'string' && item.article_html.trim()) {
    var template = document.createElement('template');
    // Stage 2 sanitises article_html on the server to the reader allow-list.
    // This is the sole data-backed HTML parsing boundary in the frontend.
    template.innerHTML = item.article_html;
    hasArticle = Boolean(template.content.textContent.trim() || template.content.querySelector('img'));
    if (hasArticle) body.appendChild(template.content.cloneNode(true));
  }
  var readerContent = window.ReadingLogic.prepareReaderContent(item, hasArticle);
  if (readerContent.fallback && !item.told) {
    body.appendChild(el('p', { className: 'reader-fallback', textContent: readerContent.fallback }));
  }
  if (readerContent.detail && !item.told) {
    body.appendChild(el('p', { className: 'reader-detail', textContent: readerContent.detail }));
  }
  if (readerContent.post) {
    body.appendChild(el('p', { className: 'reader-community-post', textContent: readerContent.post }));
  }
  if (readerContent.replies.length) {
    var replies = el('section', { className: 'reader-replies' });
    replies.appendChild(el('h3', { textContent: 'What people said' }));
    var replyList = el('ul');
    readerContent.replies.forEach(function(reply) {
      replyList.appendChild(el('li', { textContent: reply }));
    });
    replies.appendChild(replyList);
    body.appendChild(replies);
  }

  var url = originalUrl(item);
  if (url) {
    body.appendChild(el('a', {
      className: 'reader-original-link',
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
      textContent: 'Open on ' + originalSiteName(item, url) + ' \u203a'
    }));
  }
}

function showReader(item, key, appHistoryEntry) {
  if (!item) return;
  stopStorySeenObserver();
  if (!readingState.readerOpen) readingState.briefingScrollTop = $('#briefing-page').scrollTop;
  // Measured before readerOpen flips, so it reads the edition's (or, going
  // story to story, the current story's) fold.
  mastheadState.readerFloor = currentMastheadProgress();
  renderReader(item);
  readingState.readerOpen = true;
  readingState.storyId = key;
  readingState.openerId = key;
  readingState.appHistoryEntry = Boolean(appHistoryEntry);
  queueStoryEvent('opened', key);
  startReaderReadTracking(key);
  $('#reader-page').scrollTop = 0;
  syncMastheadNow();
  setInert($('#briefing-page'), true);
  setInert($('#reader-page'), false);
  setInert($('#section-thumb-layer'), true);
  $('#section-thumb-layer').setAttribute('aria-hidden', 'true');
  $('#reader-page').setAttribute('aria-hidden', 'false');
  curlState.progress = 1;
  curlState.dragY = 0;
  renderCurl();
  $('#reading-stage').classList.remove('curl-active');
  $('#reading-stage').classList.add('reader-active');
  requestAnimationFrame(function() { $('#reader-back').focus(); });
}

function openReaderById(key, pushHistory) {
  var item = readingStories.get(String(key));
  if (!item) return;
  if (readingState.readerOpen && readingState.storyId === String(key)) return;
  if (pushHistory) {
    var url = new URL(location.href);
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    if (currentBriefingId) url.searchParams.set('edition', String(currentBriefingId));
    url.searchParams.set('story', String(key));
    history.pushState({
      reading: true,
      appHistoryEntry: true,
      editionId: currentBriefingId,
      storyId: String(key)
    }, '', url.pathname + url.search);
  }
  showReader(item, String(key), pushHistory || Boolean(history.state && history.state.appHistoryEntry));
}

function closeReader() {
  if (!readingState.readerOpen) return;
  var openerId = readingState.openerId;
  stopReaderReadTracking();
  readingState.readerOpen = false;
  readingState.storyId = null;
  readingState.appHistoryEntry = false;
  $('#reading-stage').classList.remove('reader-active', 'curl-active');
  curlState.progress = 0;
  curlState.dragY = 0;
  $('#briefing-page').scrollTop = readingState.briefingScrollTop;
  syncMastheadNow();
  renderCurl();
  setInert($('#reader-page'), true);
  $('#reader-page').setAttribute('aria-hidden', 'true');
  setInert($('#briefing-page'), false);
  setInert($('#section-thumb-layer'), false);
  $('#section-thumb-layer').removeAttribute('aria-hidden');
  startStorySeenObserver();
  requestAnimationFrame(function() {
    $('#briefing-page').scrollTop = readingState.briefingScrollTop;
    var opener = readingStoryOpeners.get(openerId);
    if (opener && !opener.closest('[hidden]')) opener.focus();
  });
}

function returnFromReader() {
  startBackTurn();
}

function closeReaderFromHistory() {
  if (!readingState.readerOpen) return;
  if (curlState.progress <= 0.0005) {
    closeReader();
    return;
  }
  cancelCurlAnimation();
  if (prefersReducedMotion()) {
    reducedBackTurn(closeReader);
    return;
  }
  refreshCurlGhost();
  setCurlCorner($('#reading-stage').clientHeight * 0.8);
  curlState.progress = 1;
  curlState.dragY = 0;
  $('#reading-stage').classList.remove('reader-active');
  animateCurlTo(0, closeReader);
}

function syncReaderFromLocation() {
  if (!briefingLoaded || location.pathname !== '/') return;
  var key = new URLSearchParams(location.search).get('story');
  if (!key) {
    closeReaderFromHistory();
    return;
  }
  var state = history.state || {};
  var wrongEdition = state.editionId !== undefined && state.editionId !== null && String(state.editionId) !== String(currentBriefingId);
  if (wrongEdition || !readingStories.has(key)) {
    var editionUrl = currentBriefingId ? '/?edition=' + encodeURIComponent(currentBriefingId) : '/';
    history.replaceState({ editionId: currentBriefingId }, '', editionUrl);
    closeReader();
    return;
  }
  if (readingState.readerOpen && readingState.storyId === key) return;
  showReader(readingStories.get(key), key, Boolean(state.appHistoryEntry));
}

$('#reader-back').addEventListener('click', returnFromReader);

$('#reader-page').addEventListener('scroll', function() {
  if (!readingState.readerOpen || !isEditionStory(readingState.storyId) || this.scrollTop <= 0) return;
  readerHasScrolled = true;
  var progress = (this.scrollTop + this.clientHeight) / Math.max(1, this.scrollHeight);
  if (progress >= 0.75) queueStoryEvent('read_full', readingState.storyId);
}, { passive: true });

function pointerPosition(event) {
  var rect = $('#reading-stage').getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function markCurlClickSuppressed() {
  suppressCurlClick = true;
  if (suppressCurlClickTimer !== null) clearTimeout(suppressCurlClickTimer);
  suppressCurlClickTimer = setTimeout(function() {
    suppressCurlClick = false;
    suppressCurlClickTimer = null;
  }, 0);
}

function finishCurlGesture(cancelled) {
  var gesture = curlState.gesture;
  if (!gesture) return;
  curlState.gesture = null;
  if (!gesture.direction) return;
  markCurlClickSuppressed();
  var target = cancelled
    ? (gesture.direction === 'forward' ? 0 : 1)
    : window.ReadingLogic.settleGesture({
      direction: gesture.direction,
      progress: curlState.progress,
      velocityX: gesture.velocityX
    });

  if (gesture.direction === 'forward') {
    if (target === 1) {
      if (prefersReducedMotion()) reducedForwardTurn(gesture.storyId);
      else animateCurlTo(1, function() { openReaderById(gesture.storyId, true); });
    } else if (prefersReducedMotion()) {
      curlState.progress = 0;
      curlState.dragY = 0;
      $('#reading-stage').classList.remove('curl-active');
      clearPreparedReader();
    } else {
      animateCurlTo(0, clearPreparedReader);
    }
    return;
  }

  if (target === 0) {
    if (prefersReducedMotion()) reducedBackTurn(completeReaderReturn);
    else animateCurlTo(0, completeReaderReturn);
  } else if (prefersReducedMotion()) {
    curlState.progress = 1;
    curlState.dragY = 0;
    $('#reading-stage').classList.remove('curl-active');
  } else {
    animateCurlTo(1, function() {
      $('#reading-stage').classList.remove('curl-active');
      $('#reading-stage').classList.add('reader-active');
    });
  }
}

function onCurlPointerDown(event) {
  if (!event.isPrimary || curlState.animation || curlState.gesture) return;
  var side = event.currentTarget.id === 'briefing-page' ? 'briefing' : 'reader';
  if ((side === 'briefing' && readingState.readerOpen) || (side === 'reader' && !readingState.readerOpen)) return;
  var point = pointerPosition(event);
  var story = side === 'briefing' && event.target.closest ? event.target.closest('.reading-story') : null;
  curlState.gesture = {
    pointerId: event.pointerId,
    source: event.currentTarget,
    side: side,
    story: story,
    storyId: story ? story.dataset.storyId : null,
    startX: point.x,
    startY: point.y,
    lastX: point.x,
    lastTime: performance.now(),
    velocityX: 0,
    direction: null
  };
}

function onCurlPointerMove(event) {
  var gesture = curlState.gesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  var point = pointerPosition(event);
  var dx = point.x - gesture.startX;
  var dy = point.y - gesture.startY;

  if (!gesture.direction) {
    var decision = window.ReadingLogic.decideGesture({
      dx: dx,
      dy: dy,
      side: gesture.side,
      startedOnStory: Boolean(gesture.story)
    });
    if (decision === 'wait') return;
    if (decision === 'vertical' || decision === 'ignore') {
      curlState.gesture = null;
      return;
    }
    gesture.direction = decision;
    $('#reading-stage').classList.add('curl-active');
    if (decision === 'forward' && !prepareReaderForCurl(gesture.storyId)) {
      $('#reading-stage').classList.remove('curl-active');
      curlState.gesture = null;
      return;
    }
    if (decision === 'back') {
      refreshCurlGhost();
      if (!prefersReducedMotion()) $('#reading-stage').classList.remove('reader-active');
    }
    setCurlCorner(gesture.startY);
    try { gesture.source.setPointerCapture(event.pointerId); } catch (_) { /* pointer capture is best effort */ }
  }

  var now = performance.now();
  gesture.velocityX = (point.x - gesture.lastX) / Math.max(1, now - gesture.lastTime);
  gesture.lastX = point.x;
  gesture.lastTime = now;
  var width = Math.max(1, $('#reading-stage').clientWidth);
  curlState.progress = gesture.direction === 'forward'
    ? Math.max(0, Math.min(1, -dx / width))
    : Math.max(0, Math.min(1, 1 - dx / width));
  curlState.dragY = dy * 0.6;
  if (!prefersReducedMotion()) renderCurl();
  event.preventDefault();
}

function onCurlPointerUp(event) {
  if (!curlState.gesture || curlState.gesture.pointerId !== event.pointerId) return;
  finishCurlGesture(false);
}

function onCurlPointerCancel(event) {
  if (!curlState.gesture || curlState.gesture.pointerId !== event.pointerId) return;
  finishCurlGesture(true);
}

function suppressMovedPointerClick(event) {
  if (!suppressCurlClick) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  suppressCurlClick = false;
  if (suppressCurlClickTimer !== null) clearTimeout(suppressCurlClickTimer);
  suppressCurlClickTimer = null;
}

[$('#briefing-page'), $('#reader-page')].forEach(function(page) {
  page.addEventListener('pointerdown', onCurlPointerDown);
  page.addEventListener('pointermove', onCurlPointerMove, { passive: false });
  page.addEventListener('pointerup', onCurlPointerUp);
  page.addEventListener('pointercancel', onCurlPointerCancel);
  page.addEventListener('click', suppressMovedPointerClick, true);
});

function rerenderCurlAfterResize() {
  syncEditionLayout();
  scheduleMastheadMeasure();
  if (curlState.gesture && curlState.gesture.story && !curlState.gesture.story.isConnected) {
    finishCurlGesture(true);
    return;
  }
  layoutThumbIndex();
  syncThumbIndexHere();
  renderCurl();
}

window.addEventListener('resize', rerenderCurlAfterResize);
window.addEventListener('orientationchange', rerenderCurlAfterResize);
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', scheduleMastheadUpdate);

// ============================================================
// 6. Archive
// ============================================================

var archiveBriefings = [];
var archiveQuery = '';
var archiveSearchTimer = null;
var archiveSearchRequest = 0;
var archiveSearchResult = null;
var archiveScrollTop = 0;
var archiveRestoreScroll = false;

async function loadArchive() {
  var input = $('#archive-search-input');
  input.value = archiveQuery;
  $('#archive-status').textContent = 'Loading previous editions…';
  try {
    var res = await fetch('/api/briefings');
    var json = await res.json();
    archiveBriefings = json.briefings || [];
    if (archiveQuery.trim()) {
      if (archiveSearchResult && archiveSearchResult.query === archiveQuery.trim()) {
        renderArchiveResults(archiveSearchResult);
        restoreArchivePosition();
      } else {
        await runArchiveSearch(true, false);
      }
    }
    else {
      renderArchiveEditions();
      restoreArchivePosition();
    }
  } catch (err) {
    $('#archive-status').textContent = 'Previous editions could not be loaded.';
    console.error('Failed to load archive:', err);
  }
}

function archiveMonth(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    month: 'long', year: 'numeric'
  });
}

function archiveDay(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
}

function localDateKey() {
  var today = new Date();
  return today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');
}

function rememberArchivePosition() {
  archiveScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
  archiveRestoreScroll = true;
}

function restoreArchivePosition() {
  if (!archiveRestoreScroll) return;
  requestAnimationFrame(function() {
    window.scrollTo(0, archiveScrollTop);
    archiveRestoreScroll = false;
  });
}

function openArchiveEdition(id) {
  rememberArchivePosition();
  router.navigate('/?edition=' + encodeURIComponent(id), { editionId: id });
}

function openArchiveResult(editionId, storyKeyValue) {
  rememberArchivePosition();
  var editionUrl = '/?edition=' + encodeURIComponent(editionId);
  router.navigate(editionUrl, { editionId: editionId });
  var storyUrl = editionUrl + '&story=' + encodeURIComponent(storyKeyValue);
  history.pushState({
    reading: true,
    appHistoryEntry: true,
    editionId: editionId,
    storyId: String(storyKeyValue)
  }, '', storyUrl);
}

function renderArchiveEditions() {
  var list = $('#archive-list');
  list.replaceChildren();
  $('#archive-status').textContent = archiveBriefings.length +
    (archiveBriefings.length === 1 ? ' edition' : ' editions');
  var currentMonth = '';
  var todayKey = localDateKey();

  archiveBriefings.forEach(function(b) {
    var month = archiveMonth(b.date);
    if (month !== currentMonth) {
      currentMonth = month;
      list.appendChild(el('h3', { className: 'archive-month', textContent: month }));
    }
    var isToday = b.date === todayKey;
    var date = el('span', { className: 'archive-edition-date' }, [
      archiveDay(b.date),
      isToday ? el('span', { className: 'archive-today', textContent: 'Today' }) : null
    ]);
    list.appendChild(el('button', {
      type: 'button',
      className: 'archive-edition' + (String(b.id) === String(currentBriefingId) ? ' current' : ''),
      'data-id': b.id,
      onclick: function() { openArchiveEdition(b.id); }
    }, [
      date,
      el('span', { className: 'archive-edition-headline', textContent: b.headline || 'No headline' }),
      el('span', {
        className: 'archive-edition-count',
        textContent: b.item_count + (b.item_count === 1 ? ' story' : ' stories')
      })
    ]));
  });
}

function appendMarkedSnippet(node, snippet) {
  var mark = null;
  function decodeEntities(value) {
    var textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  }
  String(snippet || '').split(/(<\/?mark>)/i).forEach(function(part) {
    if (!part) return;
    if (/^<mark>$/i.test(part)) {
      mark = el('mark');
      node.appendChild(mark);
    } else if (/^<\/mark>$/i.test(part)) {
      mark = null;
    } else {
      (mark || node).appendChild(document.createTextNode(decodeEntities(part)));
    }
  });
}

function renderArchiveResults(result) {
  var list = $('#archive-list');
  list.replaceChildren();
  $('#archive-status').textContent = result.total + (result.total === 1 ? ' story found' : ' stories found');
  if (!result.total) {
    list.appendChild(el('p', {
      className: 'archive-empty',
      textContent: 'Nothing found for “' + archiveQuery.trim() + '”.'
    }));
    return;
  }

  result.editions.forEach(function(edition) {
    list.appendChild(el('h3', {
      className: 'archive-result-date',
      textContent: formatDate(edition.date)
    }));
    edition.stories.forEach(function(story) {
      var snippet = el('span', { className: 'archive-result-snippet' });
      appendMarkedSnippet(snippet, story.snippet);
      list.appendChild(el('button', {
        type: 'button',
        className: 'archive-result',
        onclick: function() { openArchiveResult(edition.id, story.key); }
      }, [
        el('span', {
          className: 'archive-result-meta',
          textContent: [story.kicker, story.section].filter(Boolean).join(' · ')
        }),
        el('span', { className: 'archive-result-title', textContent: story.title || 'Untitled story' }),
        snippet
      ]));
    });
  });

  if (result.has_more && result.next_before) {
    list.appendChild(el('button', {
      type: 'button',
      className: 'archive-more',
      textContent: 'Show older results',
      onclick: function(event) {
        event.currentTarget.disabled = true;
        event.currentTarget.textContent = 'Loading older results…';
        runArchiveSearch(false, true);
      }
    }));
  }
}

function mergeArchiveSearchResults(current, older) {
  if (!current) return older;
  var seen = new Set(current.editions.map(function(edition) { return String(edition.id); }));
  var editions = current.editions.slice();
  older.editions.forEach(function(edition) {
    if (seen.has(String(edition.id))) return;
    seen.add(String(edition.id));
    editions.push(edition);
  });
  return {
    query: older.query,
    total: older.total,
    has_more: older.has_more,
    next_before: older.next_before,
    editions: editions
  };
}

async function runArchiveSearch(restorePosition, append) {
  var query = archiveQuery.trim();
  if (!query) {
    archiveSearchResult = null;
    renderArchiveEditions();
    if (restorePosition) restoreArchivePosition();
    return;
  }
  if (append && (!archiveSearchResult || !archiveSearchResult.next_before)) return;
  var request = ++archiveSearchRequest;
  if (!append) $('#archive-status').textContent = 'Searching…';
  try {
    var searchUrl = '/api/search?q=' + encodeURIComponent(query);
    if (append) searchUrl += '&before=' + encodeURIComponent(archiveSearchResult.next_before);
    var res = await fetch(searchUrl);
    var result = await res.json();
    if (request !== archiveSearchRequest) return;
    if (!res.ok) throw new Error(result.error || 'Search failed');
    archiveSearchResult = append ? mergeArchiveSearchResults(archiveSearchResult, result) : result;
    renderArchiveResults(archiveSearchResult);
    if (restorePosition) restoreArchivePosition();
  } catch (err) {
    if (request !== archiveSearchRequest) return;
    if (append && archiveSearchResult) {
      renderArchiveResults(archiveSearchResult);
      $('#archive-status').textContent += ' · Older results could not be loaded.';
    } else {
      $('#archive-status').textContent = 'Search could not be completed.';
    }
    console.error('Failed to search archive:', err);
  }
}

$('#archive-search-input').addEventListener('input', function(event) {
  archiveQuery = event.target.value;
  archiveSearchResult = null;
  archiveRestoreScroll = false;
  archiveScrollTop = 0;
  window.scrollTo(0, 0);
  if (archiveSearchTimer !== null) clearTimeout(archiveSearchTimer);
  archiveSearchRequest += 1;
  if (!archiveQuery.trim()) {
    renderArchiveEditions();
    return;
  }
  $('#archive-status').textContent = 'Searching…';
  archiveSearchTimer = setTimeout(function() {
    archiveSearchTimer = null;
    runArchiveSearch(false);
  }, 250);
});

$('#archive-search-form').addEventListener('submit', function(event) {
  event.preventDefault();
  if (archiveSearchTimer !== null) clearTimeout(archiveSearchTimer);
  archiveSearchTimer = null;
  archiveQuery = $('#archive-search-input').value;
  archiveSearchResult = null;
  runArchiveSearch(false, false);
});

$('#app-title').addEventListener('click', function() {
  if (readingState.readerOpen) returnFromReader();
  else router.navigate('/');
});

$('#btn-archive').addEventListener('click', function() {
  router.toggle('/archive');
});

$('#btn-close-archive').addEventListener('click', function() {
  router.navigate('/');
});

$('#edition-today').addEventListener('click', function() {
  router.navigate('/');
});

// ============================================================
// 7. Settings Panel
// ============================================================

$('#btn-settings').addEventListener('click', function() {
  router.toggle('/settings');
});

$('#btn-close-settings').addEventListener('click', function() {
  router.navigate('/');
});

var settingsPageData = null;
var behindScenesLoaded = false;
var settingsPageLoadPromise = null;

async function saveSettings(values, status) {
  try {
    var response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    var result = await response.json().catch(function() { return {}; });
    if (!response.ok) throw new Error(result.error || 'Could not save');
    if (status) {
      status.textContent = 'Saved';
      status.className = 'status-msg success';
    }
    return true;
  } catch (error) {
    if (status) {
      status.textContent = error.message;
      status.className = 'status-msg error';
    }
    return false;
  }
}

function switchControl(labelText, checked) {
  var label = el('label', { className: 'settings-switch' });
  var input = el('input', { type: 'checkbox' });
  input.checked = Boolean(checked);
  label.append(input, el('span', { className: 'toggle-slider' }), el('span', { textContent: labelText }));
  return { element: label, input: input };
}

function interestValue(row) {
  return {
    label: row.querySelector('[data-field="label"]').value,
    kind: row.dataset.kind || 'topic',
    terms: row.querySelector('[data-field="terms"]').value.split(','),
    weight: Number(row.querySelector('[data-field="weight"]').value),
    urgent: row.querySelector('[data-field="urgent"]').checked,
    requires_place: row.querySelector('[data-field="place"]').checked
  };
}

function renderInterestEditor(settings) {
  var container = $('#settings-interests-body');
  var interests = JSON.parse(JSON.stringify(settings.interests || []));
  var starting = JSON.parse(JSON.stringify(settings.starting_interests || settings.interests || []));
  var list = el('div', { className: 'interest-list' });
  var status = el('p', { className: 'status-msg', 'aria-live': 'polite' });
  var activeRow = null;
  var save;

  function setDirty() {
    status.textContent = 'Unsaved changes';
    status.className = 'status-msg unsaved';
    if (save) save.disabled = false;
  }

  function updateSummary(row) {
    var value = interestValue(row);
    var summary = row.querySelector('.interest-summary');
    var name = summary.querySelector('.interest-summary-name');
    var words = summary.querySelector('.interest-summary-words');
    var tags = summary.querySelector('.interest-summary-tags');
    name.textContent = value.label.trim() || 'New interest';
    words.textContent = value.terms.map(function(term) { return term.trim(); }).filter(Boolean).join(', ') || 'Add words to match';
    tags.replaceChildren(el('span', { className: 'interest-tag', textContent: ({ 1: 'A little', 2: 'A lot', 3: 'Most' })[value.weight] || 'A lot' }));
    if (value.urgent) tags.appendChild(el('span', { className: 'interest-tag', textContent: 'Can interrupt me' }));
    if (value.requires_place) tags.appendChild(el('span', { className: 'interest-tag', textContent: 'Only near home' }));
  }

  function closeRow(row) {
    if (!row) return;
    updateSummary(row);
    row.classList.remove('editing');
    row.querySelector('.interest-summary').setAttribute('aria-expanded', 'false');
    if (activeRow === row) activeRow = null;
  }

  function openRow(row) {
    if (activeRow && activeRow !== row) closeRow(activeRow);
    if (row.classList.contains('editing')) {
      closeRow(row);
      return;
    }
    activeRow = row;
    row.classList.add('editing');
    row.querySelector('.interest-summary').setAttribute('aria-expanded', 'true');
    var name = row.querySelector('[data-field="label"]');
    if (!name.value) name.focus();
  }

  function rowFor(interest) {
    var row = el('article', { className: 'interest-row', 'data-kind': interest.kind || 'topic' });
    var summary = el('button', { className: 'interest-summary', type: 'button', 'aria-expanded': 'false' }, [
      el('span', { className: 'interest-summary-copy' }, [
        el('strong', { className: 'interest-summary-name' }),
        el('span', { className: 'interest-summary-words' })
      ]),
      el('span', { className: 'interest-summary-tags' })
    ]);
    var name = el('input', { className: 'form-input', 'data-field': 'label', value: interest.label || '', placeholder: 'Name' });
    var terms = el('input', { className: 'form-input', 'data-field': 'terms', value: (interest.terms || []).join(', '), placeholder: 'Words and phrases, separated by commas' });
    var weight = el('select', { className: 'form-select', 'data-field': 'weight' });
    [[1, 'A little'], [2, 'A lot'], [3, 'Most']].forEach(function(choice) {
      var option = el('option', { value: String(choice[0]), textContent: choice[1] });
      option.selected = Number(interest.weight) === choice[0];
      weight.appendChild(option);
    });
    var urgent = switchControl('Can interrupt me', interest.urgent);
    urgent.input.dataset.field = 'urgent';
    var place = switchControl('Only near home', interest.requires_place);
    place.input.dataset.field = 'place';
    var matches = el('div', { className: 'interest-matches hidden', 'aria-live': 'polite' });
    var tryButton = el('button', { className: 'btn btn-secondary', textContent: 'Try it', onclick: async function() {
      tryButton.disabled = true;
      matches.className = 'interest-matches';
      matches.textContent = 'Looking through today’s stories…';
      try {
        var response = await fetch('/api/interests/try', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(interestValue(row))
        });
        var result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not try this');
        matches.replaceChildren();
        if (!result.matches.length) {
          matches.textContent = 'No stories caught today.';
        } else {
          matches.appendChild(el('p', { textContent: result.matches.length + (result.matches.length === 1 ? ' story caught.' : ' stories caught.') }));
          var found = el('ul');
          result.matches.forEach(function(match) {
            found.appendChild(el('li', { textContent: match.title + (match.source ? ' — ' + match.source : '') }));
          });
          matches.appendChild(found);
        }
      } catch (error) {
        matches.textContent = error.message;
      }
      tryButton.disabled = false;
    }});
    var done = el('button', { className: 'btn btn-secondary', textContent: 'Done', onclick: function() { closeRow(row); } });
    var remove = el('button', { className: 'btn btn-danger', textContent: 'Remove', onclick: function() {
      if (activeRow === row) activeRow = null;
      row.remove();
      setDirty();
    }});
    var editor = el('div', { className: 'interest-editor' }, [
      el('label', {}, [el('span', { textContent: 'Name' }), name]),
      el('label', { className: 'interest-terms' }, [el('span', { textContent: 'Words that match' }), terms]),
      el('label', {}, [el('span', { textContent: 'How much it matters' }), weight]),
      el('div', { className: 'interest-switches' }, [urgent.element, place.element]),
      el('div', { className: 'settings-actions' }, [tryButton, remove, done]),
      matches
    ]);
    summary.addEventListener('click', function() { openRow(row); });
    [name, terms].forEach(function(input) { input.addEventListener('input', setDirty); });
    [weight, urgent.input, place.input].forEach(function(input) { input.addEventListener('change', setDirty); });
    row.append(summary, editor);
    updateSummary(row);
    return row;
  }

  function renderRows(values) {
    activeRow = null;
    list.replaceChildren();
    values.forEach(function(interest) { list.appendChild(rowFor(interest)); });
  }
  renderRows(interests);
  var add = el('button', { className: 'btn btn-secondary', textContent: 'Add an interest', onclick: function() {
    var row = rowFor({ label: '', kind: 'topic', terms: [], weight: 2, urgent: false, requires_place: false });
    list.appendChild(row);
    setDirty();
    openRow(row);
  }});
  var reset = el('button', { className: 'btn btn-secondary', textContent: 'Reset to the starting list', onclick: function() {
    if (confirm('Reset every interest to the starting list?')) {
      renderRows(starting);
      setDirty();
    }
  }});
  save = el('button', { className: 'btn btn-primary', textContent: 'Save interests', disabled: true, onclick: async function() {
    var values = Array.from(list.children).map(interestValue);
    if (await saveSettings({ interests: values }, status)) {
      settings.interests = values;
      save.disabled = true;
    }
  }});
  status.textContent = 'Saved';
  status.className = 'status-msg success';
  container.replaceChildren(
    el('p', { className: 'settings-intro', textContent: 'Choose the places and subjects the paper watches for.' }),
    list,
    el('div', { className: 'settings-actions settings-actions-wide' }, [add, reset]),
    el('div', { className: 'interest-save-bar' }, [save, status])
  );
}

function renderNotificationsSettings(settings) {
  var container = $('#settings-notifications-body');
  var cap = el('input', { className: 'form-input', type: 'number', min: '0', max: '100', value: String(settings.alert_daily_cap == null ? 3 : settings.alert_daily_cap) });
  var quietStart = el('input', { className: 'form-input', type: 'time', value: (settings.quiet_hours || ['22:00', '06:00'])[0] });
  var quietEnd = el('input', { className: 'form-input', type: 'time', value: (settings.quiet_hours || ['22:00', '06:00'])[1] });
  var status = el('span', { className: 'notif-status', id: 'notif-status' });
  var saveStatus = el('p', { className: 'status-msg', 'aria-live': 'polite' });
  container.replaceChildren(
    el('div', { className: 'settings-control-line' }, [
      el('span', { textContent: 'Notifications' }),
      el('button', { className: 'btn-notif-toggle', id: 'btn-notif-toggle', textContent: 'Enable' }),
      el('button', { className: 'btn-notif-toggle', id: 'btn-notif-test', textContent: 'Send me a test' }),
      status
    ]),
    el('div', { className: 'settings-grid' }, [
      el('label', {}, [el('span', { textContent: 'Most urgent alerts in a day' }), cap]),
      el('label', {}, [el('span', { textContent: 'Quiet hours start' }), quietStart]),
      el('label', {}, [el('span', { textContent: 'Quiet hours finish' }), quietEnd])
    ]),
    el('div', { className: 'settings-actions' }, [el('button', { className: 'btn btn-primary', textContent: 'Save notifications', onclick: function() {
      saveSettings({ alert_daily_cap: Number(cap.value), quiet_hours: [quietStart.value, quietEnd.value] }, saveStatus);
    }})]),
    saveStatus
  );
  bindNotifToggle();
  bindNotifTest();
  updateNotifUI();
}

var PAPER_SECTIONS = [
  ['tasmania', 'Tasmania'], ['australia', 'Australia'], ['world', 'World'],
  ['tech', 'Tech & Security'], ['homelab', 'Homelab & Self-hosting'],
  ['gaming', 'Gaming'], ['sport', 'Sport'], ['internet', 'Around the internet']
];

function renderPaperSettings(settings) {
  var container = $('#settings-paper-body');
  var schedule = Array.isArray(settings.schedule) ? settings.schedule.slice() : ['06:00'];
  var scheduleList = el('div', { className: 'schedule-list' });
  var timeInput = el('input', { className: 'form-input', type: 'time', value: '06:00' });
  var timezone = el('input', { className: 'form-input', value: settings.timezone || 'UTC' });
  var topMin = el('input', { className: 'form-input', type: 'number', min: '1', value: String((settings.top_size || { min: 5 }).min) });
  var topMax = el('input', { className: 'form-input', type: 'number', min: '1', value: String((settings.top_size || { max: 7 }).max) });
  var sectionSize = el('input', { className: 'form-input', type: 'number', min: '1', value: String(settings.section_size == null ? 5 : settings.section_size) });
  var learning = switchControl('Learn from what I read', settings.learning_enabled !== false);
  var sectionById = new Map(PAPER_SECTIONS);
  var sectionValues = (settings.sections || PAPER_SECTIONS.map(function(pair) { return { id: pair[0], hidden: false }; }))
    .filter(function(entry) { return sectionById.has(entry.id); });
  PAPER_SECTIONS.forEach(function(pair) {
    if (!sectionValues.some(function(entry) { return entry.id === pair[0]; })) sectionValues.push({ id: pair[0], hidden: false });
  });
  var sectionList = el('div', { className: 'paper-section-list' });
  var status = el('p', { className: 'status-msg', 'aria-live': 'polite' });

  function renderSchedule() {
    scheduleList.replaceChildren();
    schedule.forEach(function(time, index) {
      scheduleList.appendChild(el('div', { className: 'schedule-time' }, [
        el('span', { textContent: time }),
        el('button', { className: 'btn btn-danger', textContent: 'Remove', onclick: function() { schedule.splice(index, 1); renderSchedule(); } })
      ]));
    });
  }
  function renderSectionList() {
    sectionList.replaceChildren();
    sectionValues.forEach(function(entry, index) {
      var shown = switchControl('Show', !entry.hidden);
      shown.input.addEventListener('change', function() { entry.hidden = !shown.input.checked; });
      sectionList.appendChild(el('div', { className: 'paper-section-row' }, [
        el('strong', { textContent: sectionById.get(entry.id) }), shown.element,
        el('button', { className: 'btn btn-secondary', textContent: 'Up', disabled: index === 0, onclick: function() {
          sectionValues.splice(index - 1, 0, sectionValues.splice(index, 1)[0]); renderSectionList();
        }}),
        el('button', { className: 'btn btn-secondary', textContent: 'Down', disabled: index === sectionValues.length - 1, onclick: function() {
          sectionValues.splice(index + 1, 0, sectionValues.splice(index, 1)[0]); renderSectionList();
        }})
      ]));
    });
  }
  renderSchedule();
  renderSectionList();
  container.replaceChildren(
    el('div', { className: 'settings-subsection' }, [
      el('h4', { textContent: 'Written at' }), scheduleList,
      el('div', { className: 'settings-inline' }, [timeInput, el('button', { className: 'btn btn-secondary', textContent: 'Add time', onclick: function() {
        if (timeInput.value && schedule.indexOf(timeInput.value) === -1) { schedule.push(timeInput.value); schedule.sort(); renderSchedule(); }
      }})]),
      el('label', {}, [el('span', { textContent: 'Timezone' }), timezone])
    ]),
    el('div', { className: 'settings-grid' }, [
      el('label', {}, [el('span', { textContent: 'You should know — at least' }), topMin]),
      el('label', {}, [el('span', { textContent: 'You should know — at most' }), topMax]),
      el('label', {}, [el('span', { textContent: 'Stories in each section' }), sectionSize])
    ]),
    el('div', { className: 'settings-subsection' }, [learning.element]),
    el('div', { className: 'settings-subsection' }, [el('h4', { textContent: 'Sections' }), sectionList]),
    el('div', { className: 'settings-actions' }, [el('button', { className: 'btn btn-primary', textContent: 'Save the paper', onclick: function() {
      saveSettings({
        schedule: schedule,
        timezone: timezone.value,
        top_size: { min: Number(topMin.value), max: Number(topMax.value) },
        section_size: Number(sectionSize.value),
        learning_enabled: learning.input.checked,
        sections: sectionValues
      }, status);
    }})]), status
  );
}

function themeChooser() {
  var chooser = el('div', { className: 'theme-switcher' });
  ['auto', 'system', 'light', 'dark'].forEach(function(mode) {
    chooser.appendChild(el('button', { className: 'theme-option', 'data-theme': mode, textContent: mode.charAt(0).toUpperCase() + mode.slice(1) }));
  });
  return chooser;
}

async function loadBehindScenes(settings) {
  if (behindScenesLoaded) return;
  behindScenesLoaded = true;
  var container = $('#settings-behind-body');
  var appearance = el('div', { className: 'settings-subsection' }, [
    el('h4', { textContent: 'Appearance' }), themeChooser(),
    el('div', { className: 'settings-control-line' }, [
      el('span', { textContent: 'Install app' }),
      el('button', { className: 'btn-notif-toggle', id: 'btn-install', textContent: 'Install' }),
      el('span', { className: 'notif-status', id: 'install-status' })
    ])
  ]);
  var ai = el('div', { className: 'settings-subsection' });
  var backup = el('div', { className: 'settings-subsection' });
  var logs = el('div', { className: 'settings-subsection' });
  container.replaceChildren(appearance, ai, backup, logs);
  bindThemeSwitcher();
  applyTheme(getStoredTheme());
  bindInstallButton();
  updateInstallUI();
  await loadOllamaTab(ai);
  var writerModel = el('input', { className: 'form-input', value: settings.writer_ollama_model || settings.ollama_model || 'gemma4:26b' });
  var toldModel = el('input', { className: 'form-input', value: settings.told_ollama_model || settings.writer_ollama_model || settings.ollama_model || 'gemma4:26b' });
  var writerThreads = el('input', { className: 'form-input', type: 'number', min: '1', value: String(settings.writer_num_thread == null ? 4 : settings.writer_num_thread) });
  var toldThreads = el('input', { className: 'form-input', type: 'number', min: '1', value: String(settings.told_num_thread == null ? 4 : settings.told_num_thread) });
  var context = el('input', { className: 'form-input', type: 'number', min: '1024', value: String(settings.ollama_num_ctx == null ? 8192 : settings.ollama_num_ctx) });
  var modelStatus = el('p', { className: 'status-msg' });
  ai.append(
    el('div', { className: 'settings-grid' }, [
      el('label', {}, [el('span', { textContent: 'Writer model' }), writerModel]),
      el('label', {}, [el('span', { textContent: 'How it was told model' }), toldModel]),
      el('label', {}, [el('span', { textContent: 'Writer threads' }), writerThreads]),
      el('label', {}, [el('span', { textContent: 'How it was told threads' }), toldThreads]),
      el('label', {}, [el('span', { textContent: 'Context size' }), context])
    ]),
    el('button', { className: 'btn btn-primary', textContent: 'Save AI settings', onclick: function() {
      saveSettings({
        writer_ollama_model: writerModel.value,
        told_ollama_model: toldModel.value,
        writer_num_thread: Number(writerThreads.value),
        told_num_thread: Number(toldThreads.value),
        ollama_num_ctx: Number(context.value)
      }, modelStatus);
    }}), modelStatus
  );
  loadBackupTab(backup);
  loadLogTab(logs);
}

async function loadSettingsPage() {
  behindScenesLoaded = false;
  try {
    var response = await fetch('/api/settings');
    if (!response.ok) throw new Error('Could not load settings');
    settingsPageData = await response.json();
    renderInterestEditor(settingsPageData);
    var sourcesLoading = loadSourcesTab($('#settings-sources-body'));
    renderNotificationsSettings(settingsPageData);
    renderPaperSettings(settingsPageData);
    var details = $('#behind-the-scenes');
    $('#settings-behind-body').textContent = 'Open to load.';
    if (details.open) loadBehindScenes(settingsPageData);
    if (details.dataset.bound !== '1') {
      details.dataset.bound = '1';
      details.addEventListener('toggle', function() {
        if (details.open && settingsPageData) loadBehindScenes(settingsPageData);
      });
    }
    await sourcesLoading;
    if (location.hash) {
      var sectionId = location.hash.slice(1);
      scrollToSettingsSection(sectionId, false);
      // Native fragment scrolling can run once more after async content settles.
      setTimeout(function() {
        if (location.pathname === '/settings' && location.hash === '#' + sectionId) scrollToSettingsSection(sectionId, false);
      }, 100);
    }
  } catch (error) {
    $('#settings-interests-body').textContent = 'Could not load settings.';
  }
}

function settingsScrollParent(node) {
  for (var parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    var overflow = getComputedStyle(parent).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return document.scrollingElement || document.documentElement;
}

function settingsScrollOffset(scroller) {
  var rootTop = scroller === document.scrollingElement || scroller === document.documentElement
    ? 0 : scroller.getBoundingClientRect().top;
  var offset = 8;
  ['#app > header', '#settings-panel > .panel-header', '.settings-contents'].forEach(function(selector) {
    var element = document.querySelector(selector);
    if (!element || element.offsetParent === null) return;
    var position = getComputedStyle(element).position;
    if (position !== 'fixed' && position !== 'sticky') return;
    var rect = element.getBoundingClientRect();
    if (rect.top <= rootTop + offset + 1 && rect.bottom > rootTop + offset) offset = rect.bottom - rootTop + 8;
  });
  return offset;
}

function scrollToSettingsSection(id, updateHash) {
  var section = document.getElementById(id);
  if (!section) return;
  var heading = section.querySelector('h3') || section;
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var scroller = settingsScrollParent(section);
      var offset = settingsScrollOffset(scroller);
      if (scroller === document.scrollingElement || scroller === document.documentElement) {
        window.scrollTo({ top: Math.max(0, window.scrollY + heading.getBoundingClientRect().top - offset), behavior: 'auto' });
      } else {
        scroller.scrollTo({ top: scroller.scrollTop + heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset, behavior: 'auto' });
      }
      if (updateHash !== false) history.replaceState(history.state, '', location.pathname + location.search + '#' + id);
    });
  });
}

$$('.settings-contents a').forEach(function(link) {
  link.addEventListener('click', async function(event) {
    event.preventDefault();
    if (settingsPageLoadPromise) await settingsPageLoadPromise;
    scrollToSettingsSection(link.getAttribute('href').slice(1), true);
  });
});

// --- Tab: General ---
function loadGeneralTab(container) {
  var tpl = document.getElementById('tpl-general-tab');
  container.appendChild(tpl.content.cloneNode(true));
  // Re-bind interactive controls now that they exist in the DOM
  bindThemeSwitcher();
  bindNotifToggle();
  bindNotifTest();
  bindInstallButton();
  // Reflect current state onto the newly rendered controls
  applyTheme(getStoredTheme());
  updateNotifUI();
  updateInstallUI();
}

// --- Tab: Sources ---
async function loadSourcesTab(container) {
  container.textContent = 'Loading sources…';
  container.prepend(el('span', { className: 'mini-spinner' }));
  try {
    var res = await fetch('/api/sources');
    var sourcesJson = await res.json();
    var sources = sourcesJson.sources;
    container.replaceChildren();

    var sectionNames = {
      local: 'Tasmania', tasmania: 'Tasmania', australia: 'Australia', 'top-stories': 'Australia',
      world: 'World', tech: 'Tech & Security', homelab: 'Homelab & Self-hosting',
      gaming: 'Gaming', sport: 'Sport', trending: 'Around the internet'
    };
    var order = ['Tasmania', 'Australia', 'World', 'Tech & Security', 'Homelab & Self-hosting', 'Gaming', 'Sport', 'Around the internet', 'Other'];
    var grouped = {};
    sources.forEach(function(source) {
      var group = sectionNames[source.default_category] || 'Other';
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(source);
    });
    order.forEach(function(group) {
      if (!grouped[group]) return;
      var list = el('div', { className: 'source-list' });
      grouped[group].forEach(function(source) { list.appendChild(renderSourceItem(source)); });
      container.append(el('h4', { className: 'source-group-title', textContent: group }), list);
    });
    container.appendChild(renderAddSourceForm());
  } catch (err) {
    container.replaceChildren(el('p', { className: 'status-msg error', textContent: 'Failed to load sources' }));
  }
}

function renderSourceItem(source) {
  var lastRun = source.last_run;
  var statusClass = lastRun && lastRun.status === 'ok' ? 'success' : lastRun ? 'error' : 'never';
  var statusText = !lastRun ? 'No morning run yet'
    : lastRun.status === 'ok'
      ? lastRun.item_count + (lastRun.item_count === 1 ? ' story this morning' : ' stories this morning')
      : 'Didn’t work this morning' + (lastRun.error ? ': ' + String(lastRun.error).replace(/\s+/g, ' ').slice(0, 90) : '');

  var toggleLabel = el('label', { className: 'toggle source-toggle' });
  var toggleInput = el('input', { type: 'checkbox' });
  toggleInput.checked = !!source.enabled;
  toggleInput.setAttribute('aria-label', 'Use ' + source.name);
  var toggleText = el('span', { className: 'source-toggle-text', textContent: toggleInput.checked ? 'On' : 'Off' });
  toggleLabel.append(toggleInput, el('span', { className: 'toggle-slider' }), toggleText);

  var nameEl = el('span', { className: 'source-name', textContent: source.name });
  var resultEl = el('span', { className: 'source-result ' + statusClass, textContent: statusText });
  var summary = el('button', { className: 'source-summary', type: 'button', 'aria-expanded': 'false' }, [nameEl, resultEl]);

  var item = el('div', { className: 'source-item' + (source.enabled ? '' : ' disabled') }, [
    summary,
    toggleLabel
  ]);

  summary.addEventListener('click', function() {
    if (item.classList.contains('editing')) {
      closeOpenEditForm();
      return;
    }
    closeOpenEditForm();
    var form = renderSourceEditForm(source, { nameEl: nameEl, item: item });
    item.appendChild(form);
    item.classList.add('editing');
    summary.setAttribute('aria-expanded', 'true');
  });

  toggleInput.addEventListener('change', async function() {
    var enabled = toggleInput.checked;
    try {
      var response = await fetch('/api/sources/' + source.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabled ? 1 : 0 })
      });
      if (!response.ok) throw new Error('Could not change source');
      source.enabled = enabled ? 1 : 0;
      item.classList.toggle('disabled', !enabled);
      toggleText.textContent = enabled ? 'On' : 'Off';
    } catch (_) {
      toggleInput.checked = !enabled;
    }
  });

  return item;
}

function renderSourceEditForm(source, refs) {
  var form = el('div', { className: 'source-edit-form' });

  var nameInput = el('input', { className: 'form-input', value: source.name, placeholder: 'Name' });
  var urlInput = el('input', { className: 'form-input', value: source.url, placeholder: 'Feed URL or subreddit name' });

  var typeSelect = el('select', { className: 'form-select' });
  ['rss', 'reddit', 'api'].forEach(function(t) {
    var opt = el('option', { value: t, textContent: t.toUpperCase() });
    if (t === source.type) opt.selected = true;
    typeSelect.appendChild(opt);
  });

  var defaultSelect = el('select', { className: 'form-select' });
  defaultSelect.appendChild(el('option', { value: '', textContent: '— none —' }));
  [
    ['local', 'Tasmania'], ['australia', 'Australia'], ['world', 'World'], ['tech', 'Tech & Security'],
    ['homelab', 'Homelab & Self-hosting'], ['gaming', 'Gaming'], ['sport', 'Sport'], ['trending', 'Around the internet']
  ].forEach(function(choice) {
    var opt = el('option', { value: choice[0], textContent: choice[1] });
    if (choice[0] === source.default_category) opt.selected = true;
    defaultSelect.appendChild(opt);
  });

  var errorEl = el('div', { className: 'status-msg error hidden' });

  var cancelBtn = el('button', {
    className: 'btn btn-secondary btn-sm',
    textContent: 'Cancel',
    onclick: function() { closeOpenEditForm(); }
  });

  var saveBtn = el('button', {
    className: 'btn btn-primary btn-sm',
    textContent: 'Save source'
  });

  var removeBtn = el('button', {
    className: 'btn btn-danger btn-sm',
    textContent: 'Remove',
    onclick: async function() {
      if (!confirm('Remove source "' + source.name + '"?')) return;
      var response = await fetch('/api/sources/' + source.id, { method: 'DELETE' });
      if (response.ok) refs.item.remove();
      else {
        errorEl.textContent = 'Could not remove source';
        errorEl.classList.remove('hidden');
      }
    }
  });

  function save() {
    var name = nameInput.value.trim();
    var url = urlInput.value.trim();
    if (!name || !url) {
      errorEl.textContent = 'Name and URL are required';
      errorEl.classList.remove('hidden');
      return;
    }
    var payload = {
      name: name,
      url: url,
      type: typeSelect.value,
      default_category: defaultSelect.value || null
    };
    saveBtn.disabled = true;
    errorEl.classList.add('hidden');
    fetch('/api/sources/' + source.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Save failed'); });
      source.name = name;
      source.url = url;
      source.type = payload.type;
      source.default_category = payload.default_category;
      refs.nameEl.textContent = name;
      closeOpenEditForm();
    }).catch(function(err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      saveBtn.disabled = false;
    });
  }

  saveBtn.addEventListener('click', save);

  form.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeOpenEditForm(); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); }
  });

  form.append(
    el('div', { className: 'form-row' }, [el('label', { textContent: 'Name' }), nameInput]),
    el('div', { className: 'form-row' }, [el('label', { textContent: 'URL' }), urlInput]),
    el('div', { className: 'form-row' }, [el('label', { textContent: 'Type' }), typeSelect]),
    el('div', { className: 'form-row' }, [el('label', { textContent: 'Section' }), defaultSelect]),
    errorEl,
    el('div', { className: 'form-actions' }, [removeBtn, cancelBtn, saveBtn])
  );

  setTimeout(function() { nameInput.focus(); nameInput.select(); }, 0);
  return form;
}

function renderAddSourceForm() {
  var wrapper = el('div', { className: 'source-add' });
  var openButton = el('button', { className: 'btn btn-secondary source-add-button', textContent: 'Add a source', 'aria-expanded': 'false' });
  var form = el('div', { className: 'source-add-form' });

  var pasteInput = el('input', { className: 'form-input', placeholder: 'Paste RSS feed, Reddit link, or site URL' });
  var statusEl = el('div', { className: 'status-msg hidden' });

  var advancedWrap = el('div', { className: 'hidden', style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border)' } });
  var nameInput = el('input', { className: 'form-input', placeholder: 'Source name' });
  var typeSelect = el('select', { className: 'form-select' });
  ['rss', 'reddit', 'api'].forEach(function(t) { typeSelect.appendChild(el('option', { value: t, textContent: t.toUpperCase() })); });
  var urlInput = el('input', { className: 'form-input', placeholder: 'Feed URL or subreddit' });

  function showStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = 'status-msg ' + cls;
  }

  async function createSource(payload) {
    var res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      pasteInput.value = '';
      nameInput.value = '';
      urlInput.value = '';
      advancedWrap.classList.add('hidden');
      loadSourcesTab($('#settings-sources-body'));
    } else {
      var errData = await res.json().catch(function() { return {}; });
      showStatus(errData.error || 'Failed to add source', 'error');
    }
  }

  var detectedSource = null;
  var previewWrap = el('div', { className: 'source-preview hidden' });
  var saveDetected = el('button', { className: 'btn btn-primary hidden', textContent: 'Save source', onclick: async function() {
    if (detectedSource) await createSource(detectedSource);
  }});
  var addBtn = el('button', { className: 'btn btn-primary', textContent: 'Test address', onclick: async function() {
    var url = pasteInput.value.trim();
    if (!url) return;
    showStatus('Detecting…', '');
    addBtn.disabled = true;
    try {
      var res = await fetch('/api/sources/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      });
      var data = await res.json();
      if (!res.ok) {
        showStatus((data && data.error) || 'Detection failed. Use Advanced below.', 'error');
        advancedWrap.classList.remove('hidden');
        urlInput.value = url;
        return;
      }
      detectedSource = { name: data.name, type: data.type, url: data.url, config: data.config };
      showStatus('Testing ' + data.name + '…', '');
      var previewResponse = await fetch('/api/sources/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(detectedSource)
      });
      var preview = await previewResponse.json();
      if (!previewResponse.ok) throw new Error(preview.error || 'The source did not work');
      previewWrap.replaceChildren(el('strong', { textContent: data.name }), el('p', { textContent: preview.count + (preview.count === 1 ? ' story found.' : ' stories found.') }));
      var headlines = el('ul');
      preview.headlines.forEach(function(headline) { headlines.appendChild(el('li', { textContent: headline })); });
      previewWrap.appendChild(headlines);
      previewWrap.classList.remove('hidden');
      saveDetected.classList.remove('hidden');
      showStatus('Ready to save.', 'success');
    } catch (e) {
      showStatus('Detection failed: ' + e.message, 'error');
      advancedWrap.classList.remove('hidden');
      urlInput.value = url;
    } finally {
      addBtn.disabled = false;
    }
  }});

  var advancedToggle = el('button', {
    className: 'btn btn-secondary btn-sm',
    textContent: 'Advanced',
    style: { marginLeft: '8px' },
    onclick: function() { advancedWrap.classList.toggle('hidden'); }
  });

  var advancedAddBtn = el('button', { className: 'btn btn-primary', textContent: 'Add (manual)', onclick: async function() {
    if (!nameInput.value.trim() || !urlInput.value.trim()) {
      showStatus('Name and URL required', 'error');
      return;
    }
    await createSource({ name: nameInput.value.trim(), type: typeSelect.value, url: urlInput.value.trim() });
  }});

  advancedWrap.append(
    el('div', { className: 'form-label', textContent: 'Manual Entry' }),
    el('div', { className: 'form-row', style: { marginBottom: '8px' } }, [
      el('div', { className: 'form-group' }, [nameInput]),
      el('div', { className: 'form-group', style: { maxWidth: '100px' } }, [typeSelect])
    ]),
    el('div', { style: { marginBottom: '8px' } }, [urlInput]),
    advancedAddBtn
  );

  form.append(
    el('div', { style: { marginBottom: '8px' } }, [pasteInput]),
    el('div', { className: 'settings-actions' }, [addBtn, saveDetected, advancedToggle]),
    statusEl,
    previewWrap,
    advancedWrap
  );
  openButton.addEventListener('click', function() {
    if (wrapper.classList.contains('editing')) {
      closeOpenEditForm();
      return;
    }
    closeOpenEditForm();
    wrapper.classList.add('editing');
    openButton.setAttribute('aria-expanded', 'true');
    pasteInput.focus();
  });
  wrapper.append(openButton, form);
  return wrapper;
}

// --- Tab: Categories ---
async function loadCategoriesTab(container) {
  container.textContent = 'Loading categories...';
  container.prepend(el('span', { className: 'mini-spinner' }));
  try {
    var res = await fetch('/api/categories');
    var data = await res.json();
    var categories = data.categories;
    container.replaceChildren();

    var list = el('div', { className: 'category-list', id: 'category-list' });
    categories.forEach(function(c) { list.appendChild(renderCategoryItem(c)); });
    container.appendChild(list);
    setupCategoryDragDrop(list);
    container.appendChild(renderAddCategoryForm());
  } catch (err) {
    container.replaceChildren(el('p', { className: 'status-msg error', textContent: 'Failed to load categories' }));
  }
}

function renderCategoryItem(cat) {
  var nameEl = el('div', { className: 'category-name', textContent: cat.name });
  var slugEl = el('div', { className: 'category-slug', textContent: cat.description || '' });

  var editBtn = el('button', {
    className: 'btn-icon-edit',
    textContent: '\u270e',
    title: 'Edit category'
  });

  var item = el('div', {
    className: 'category-item',
    draggable: 'true',
    'data-id': String(cat.id)
  }, [
    el('span', { className: 'category-drag-handle', textContent: ICONS.grip }),
    el('div', { className: 'category-info' }, [nameEl, slugEl]),
    editBtn,
    el('button', {
      className: 'btn btn-danger btn-sm',
      textContent: '\u00d7',
      title: 'Delete category',
      onclick: async function(e) {
        e.stopPropagation();
        if (!confirm('Delete category "' + cat.name + '"?')) return;
        await fetch('/api/categories/' + cat.id, { method: 'DELETE' });
        item.remove();
      }
    })
  ]);

  editBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (item.classList.contains('editing')) {
      closeOpenEditForm();
      return;
    }
    closeOpenEditForm();
    var form = renderCategoryEditForm(cat, { nameEl: nameEl, slugEl: slugEl });
    item.appendChild(form);
    item.classList.add('editing');
    editBtn.textContent = '✕';
  });

  return item;
}

function renderCategoryEditForm(cat, refs) {
  var form = el('div', { className: 'category-edit-form' });

  var nameInput = el('input', { className: 'form-input', value: cat.name, placeholder: 'Name' });
  var descInput = el('input', { className: 'form-input', value: cat.description || '', placeholder: 'Description (optional)' });

  var errorEl = el('div', { className: 'status-msg error hidden' });

  var cancelBtn = el('button', {
    className: 'btn btn-secondary btn-sm',
    textContent: 'Cancel',
    onclick: function() { closeOpenEditForm(); }
  });

  var saveBtn = el('button', {
    className: 'btn btn-primary btn-sm',
    textContent: 'Save'
  });

  function save() {
    var name = nameInput.value.trim();
    if (!name) {
      errorEl.textContent = 'Name is required';
      errorEl.classList.remove('hidden');
      return;
    }
    var payload = { name: name, description: descInput.value.trim() || null };
    saveBtn.disabled = true;
    errorEl.classList.add('hidden');
    fetch('/api/categories/' + cat.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Save failed'); });
      cat.name = name;
      cat.description = payload.description;
      refs.nameEl.textContent = name;
      refs.slugEl.textContent = cat.description || '';
      closeOpenEditForm();
    }).catch(function(err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      saveBtn.disabled = false;
    });
  }

  saveBtn.addEventListener('click', save);

  form.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeOpenEditForm(); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); }
  });

  form.append(
    el('div', { className: 'form-row' }, [el('label', { textContent: 'Name' }), nameInput]),
    el('div', { className: 'form-row' }, [el('label', { textContent: 'Description' }), descInput]),
    errorEl,
    el('div', { className: 'form-actions' }, [cancelBtn, saveBtn])
  );

  setTimeout(function() { nameInput.focus(); nameInput.select(); }, 0);
  return form;
}

function setupCategoryDragDrop(list) {
  var dragItem = null;

  list.addEventListener('dragstart', function(e) {
    dragItem = e.target.closest('.category-item');
    if (dragItem) {
      dragItem.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  list.addEventListener('dragend', function() {
    if (dragItem) dragItem.classList.remove('dragging');
    list.querySelectorAll('.category-item').forEach(function(i) { i.classList.remove('drag-over'); });
    dragItem = null;
  });

  list.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var target = e.target.closest('.category-item');
    list.querySelectorAll('.category-item').forEach(function(i) { i.classList.remove('drag-over'); });
    if (target && target !== dragItem) target.classList.add('drag-over');
  });

  list.addEventListener('drop', async function(e) {
    e.preventDefault();
    var target = e.target.closest('.category-item');
    if (!target || !dragItem || target === dragItem) return;
    list.insertBefore(dragItem, target.nextSibling);
    var ids = Array.from(list.querySelectorAll('.category-item')).map(function(i) { return Number(i.dataset.id); });
    await fetch('/api/categories/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids })
    });
  });
}

function renderAddCategoryForm() {
  var form = el('div', { style: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' } });
  var nameInput = el('input', { className: 'form-input', placeholder: 'Name' });
  var descInput = el('input', { className: 'form-input', placeholder: 'Description (optional)' });

  var addBtn = el('button', { className: 'btn btn-primary', textContent: 'Add Category', onclick: async function() {
    if (!nameInput.value.trim()) return;
    var res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameInput.value.trim(),
        description: descInput.value.trim() || null
      })
    });
    if (res.ok) {
      switchSettingsTab('categories');
    } else {
      var err = await res.json().catch(function() { return {}; });
      if (err.error) alert(err.error);
    }
  }});

  form.append(
    el('div', { className: 'form-label', textContent: 'Add New Category' }),
    el('div', { className: 'form-row', style: { marginBottom: '8px' } }, [
      el('div', { className: 'form-group' }, [nameInput]),
      el('div', { className: 'form-group' }, [descInput])
    ]),
    addBtn
  );
  return form;
}

// --- Tab: Preferences ---
async function loadPreferencesTab(container) {
  container.textContent = 'Loading preferences...';
  container.prepend(el('span', { className: 'mini-spinner' }));
  try {
    var res = await fetch('/api/settings');
    var settings = await res.json();
    container.replaceChildren();

    var titleInput = el('input', { className: 'form-input' });
    titleInput.value = settings.app_title || 'The Daily Gump';

    var tone = el('textarea', { className: 'form-textarea' });
    tone.value = settings.preferences_tone || 'Concise, no fluff';
    var lang = el('input', { className: 'form-input' });
    lang.value = settings.preferences_language || 'English';

    var boostTags = createTagInput(settings.preferences_boost_keywords || []);
    var penaltyTags = createTagInput(settings.preferences_penalty_keywords || []);

    var maxItems = el('input', { className: 'form-input', type: 'number', min: '0', style: { maxWidth: '100px' } });
    maxItems.value = String(settings.max_curated_items != null ? settings.max_curated_items : 60);
    var threshold = el('input', { className: 'form-input', type: 'number', min: '0', style: { maxWidth: '100px' } });
    threshold.value = String(settings.score_threshold != null ? settings.score_threshold : 20);

    var statusEl = el('div', { className: 'status-msg hidden' });

    var saveBtn = el('button', { className: 'btn btn-primary', textContent: 'Save Preferences', onclick: async function() {
      try {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app_title: titleInput.value,
            preferences_tone: tone.value,
            preferences_language: lang.value,
            preferences_boost_keywords: boostTags.getTags(),
            preferences_penalty_keywords: penaltyTags.getTags(),
            max_curated_items: Number(maxItems.value) || 60,
            score_threshold: Number(threshold.value) || 20
          })
        });
        appTitle = titleInput.value || 'The Daily Gump';
        var h1 = document.querySelector('header h1');
        if (h1) h1.textContent = appTitle;
        document.title = appTitle;
        statusEl.textContent = 'Preferences saved';
        statusEl.className = 'status-msg success';
        setTimeout(function() { statusEl.classList.add('hidden'); }, 3000);
      } catch (e) {
        statusEl.textContent = 'Failed to save';
        statusEl.className = 'status-msg error';
      }
    }});

    // Preview section
    var previewTitle = el('input', { className: 'form-input', placeholder: 'Reference article title' });
    var previewDesc = el('textarea', { className: 'form-textarea', placeholder: 'Reference article description/content' });
    previewDesc.style.minHeight = '40px';
    var previewResult = el('div', { className: 'preview-result hidden' });
    var previewBtn = el('button', { className: 'btn btn-secondary', textContent: 'Test Preview', onclick: async function() {
      if (!previewTitle.value.trim()) return;
      previewBtn.disabled = true;
      previewBtn.textContent = 'Testing...';
      try {
        var res = await fetch('/api/ollama/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: previewTitle.value, description: previewDesc.value })
        });
        var data = await res.json();
        previewResult.classList.remove('hidden');
        previewResult.replaceChildren(
          el('div', { className: 'preview-title', textContent: data.title }),
          el('div', { className: 'preview-summary', textContent: data.summary }),
          el('div', { className: 'preview-detail', textContent: data.detail }),
          el('div', { className: 'preview-meta', textContent: 'Significance: ' + data.significance + (data.duration_ms ? ' | ' + (data.duration_ms / 1000).toFixed(1) + 's' : '') })
        );
      } catch (e) {
        previewResult.classList.remove('hidden');
        previewResult.textContent = 'Preview failed: ' + e.message;
      }
      previewBtn.disabled = false;
      previewBtn.textContent = 'Test Preview';
    }});

    container.append(
      el('div', { className: 'form-group' }, [el('label', { className: 'form-label', textContent: 'App Title' }), titleInput]),
      el('div', { className: 'form-group' }, [el('label', { className: 'form-label', textContent: 'Tone' }), tone]),
      el('div', { className: 'form-group' }, [el('label', { className: 'form-label', textContent: 'Language' }), lang]),
      el('div', { className: 'form-group' }, [el('label', { className: 'form-label', textContent: 'Boost Keywords (press Enter to add)' }), boostTags.element]),
      el('div', { className: 'form-group' }, [el('label', { className: 'form-label', textContent: 'Penalty Keywords (press Enter to add)' }), penaltyTags.element]),
      el('div', { className: 'form-row' }, [
        el('div', { className: 'form-group' }, [el('label', { className: 'form-label', textContent: 'Max Stories' }), maxItems, el('div', { className: 'form-hint', textContent: '0 = unlimited' })]),
        el('div', { className: 'form-group' }, [el('label', { className: 'form-label', textContent: 'Score Threshold' }), threshold])
      ]),
      saveBtn,
      statusEl,
      el('div', { style: { marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' } }, [
        el('div', { className: 'form-label', textContent: 'Preview LLM Output' }),
        el('div', { className: 'form-group' }, [previewTitle]),
        el('div', { className: 'form-group' }, [previewDesc]),
        previewBtn,
        previewResult
      ])
    );
  } catch (err) {
    container.replaceChildren(el('p', { className: 'status-msg error', textContent: 'Failed to load preferences' }));
  }
}

function createTagInput(initialTags) {
  var tags = initialTags.slice();
  var wrap = el('div', { className: 'tag-input-wrap' });
  var input = el('input', { className: 'tag-input', placeholder: 'Type and press Enter' });

  function render() {
    wrap.replaceChildren();
    tags.forEach(function(tag, i) {
      wrap.appendChild(el('span', { className: 'tag' }, [
        document.createTextNode(tag),
        el('span', { className: 'tag-remove', textContent: '\u00d7', onclick: function() { tags.splice(i, 1); render(); } })
      ]));
    });
    wrap.appendChild(input);
  }

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      tags.push(input.value.trim());
      input.value = '';
      render();
    }
    if (e.key === 'Backspace' && !input.value && tags.length) {
      tags.pop();
      render();
    }
  });

  wrap.addEventListener('click', function() { input.focus(); });
  render();

  return { element: wrap, getTags: function() { return tags.slice(); } };
}

// --- Tab: Schedule ---
async function loadScheduleTab(container) {
  container.textContent = 'Loading schedule...';
  container.prepend(el('span', { className: 'mini-spinner' }));
  try {
    var results = await Promise.all([fetch('/api/settings'), fetch('/api/pipeline/status')]);
    var settings = await results[0].json();
    var status = await results[1].json();
    container.replaceChildren();

    var schedule = settings.schedule || ['04:00'];
    if (typeof schedule === 'string') {
      try { schedule = JSON.parse(schedule); } catch (e) { schedule = [schedule]; }
    }
    var timezone = settings.timezone || 'UTC';

    var timeList = el('div', { className: 'source-list', id: 'schedule-times' });

    function renderTimes() {
      timeList.replaceChildren();
      schedule.forEach(function(time, i) {
        timeList.appendChild(el('div', { className: 'source-item' }, [
          el('div', { className: 'source-info' }, [el('div', { className: 'source-name', textContent: time })]),
          el('button', { className: 'btn btn-danger btn-sm', textContent: '\u00d7', onclick: async function() {
            schedule.splice(i, 1);
            await saveSchedule();
            renderTimes();
          }})
        ]));
      });
    }
    renderTimes();

    var timeInput = el('input', { className: 'form-input', type: 'time', style: { maxWidth: '120px' } });
    timeInput.value = '06:00';
    var tzInput = el('input', { className: 'form-input', placeholder: 'Timezone' });
    tzInput.value = timezone;

    async function saveSchedule() {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: schedule, timezone: tzInput.value })
      });
    }

    var addBtn = el('button', { className: 'btn btn-secondary', textContent: 'Add Time', onclick: async function() {
      if (timeInput.value && schedule.indexOf(timeInput.value) === -1) {
        schedule.push(timeInput.value);
        schedule.sort();
        await saveSchedule();
        renderTimes();
      }
    }});

    var saveTzBtn = el('button', { className: 'btn btn-secondary', textContent: 'Save Timezone', onclick: saveSchedule });

    var statusText = status.running ? 'Currently running' : status.lastRun ? 'Last run: ' + (status.lastRun.status || 'unknown') + ' at ' + (status.lastRun.started_at || '') : 'No runs yet';

    var runNowBtn = el('button', {
      className: 'btn btn-primary',
      textContent: 'Run Now',
      disabled: status.running,
      onclick: async function() {
        runNowBtn.disabled = true;
        runNowBtn.textContent = 'Starting...';
        try {
          await fetch('/api/pipeline/run', { method: 'POST' });
          runNowBtn.textContent = 'Running...';
          updatePipelineStatus();
        } catch (e) {
          runNowBtn.textContent = 'Run Now';
          runNowBtn.disabled = false;
        }
      }
    });

    container.append(
      el('div', { className: 'form-label', textContent: 'Scheduled Times' }),
      timeList,
      el('div', { className: 'form-row', style: { marginTop: '12px', marginBottom: '16px' } }, [
        el('div', { className: 'form-group', style: { maxWidth: '140px' } }, [timeInput]),
        el('div', { className: 'form-group', style: { flex: '0' } }, [addBtn])
      ]),
      el('div', { className: 'form-group' }, [
        el('label', { className: 'form-label', textContent: 'Timezone' }),
        tzInput,
        el('div', { style: { marginTop: '6px' } }, [saveTzBtn])
      ]),
      el('div', { style: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' } }, [
        el('div', { className: 'form-label', textContent: 'Collection' }),
        el('div', { textContent: statusText, style: { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' } }),
        runNowBtn
      ])
    );
  } catch (err) {
    container.replaceChildren(el('p', { className: 'status-msg error', textContent: 'Failed to load schedule' }));
  }
}

// --- Tab: Ollama ---
async function loadOllamaTab(container) {
  container.textContent = 'Loading Ollama settings...';
  container.prepend(el('span', { className: 'mini-spinner' }));
  try {
    var settingsRes = await fetch('/api/settings');
    var settings = await settingsRes.json();
    container.replaceChildren();

    var urlInput = el('input', { className: 'form-input' });
    urlInput.value = settings.ollama_url || 'http://ollama:11434';
    var statusEl = el('div', { className: 'status-msg hidden' });

    var testBtn = el('button', { className: 'btn btn-secondary', textContent: 'Test Connection', onclick: async function() {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      try {
        await fetch('/api/settings/ollama_url', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: urlInput.value })
        });
        var res = await fetch('/api/ollama/test', { method: 'POST' });
        var data = await res.json();
        if (data.ok) {
          statusEl.textContent = 'Connected. Models available: ' + (data.models || []).length;
          statusEl.className = 'status-msg success';
        } else {
          statusEl.textContent = 'Connection failed: ' + (data.error || 'unknown');
          statusEl.className = 'status-msg error';
        }
      } catch (e) {
        statusEl.textContent = 'Test failed: ' + e.message;
        statusEl.className = 'status-msg error';
      }
      testBtn.disabled = false;
      testBtn.textContent = 'Test Connection';
    }});

    var modelSelect = el('select', { className: 'form-select' });
    modelSelect.appendChild(el('option', { value: '', textContent: 'Loading models...' }));
    var modelInfo = el('div', { className: 'ollama-model-info hidden' });

    var saveModelBtn = el('button', { className: 'btn btn-primary', textContent: 'Save Model', onclick: async function() {
      if (modelSelect.value) {
        await fetch('/api/settings/ollama_model', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: modelSelect.value })
        });
        statusEl.textContent = 'Model saved';
        statusEl.className = 'status-msg success';
        setTimeout(function() { statusEl.classList.add('hidden'); }, 3000);
      }
    }});

    // Fetch models
    try {
      var modelsRes = await fetch('/api/ollama/models');
      var modelsData = await modelsRes.json();
      var models = modelsData.models;
      modelSelect.replaceChildren();
      var currentModel = settings.ollama_model || 'gemma4:26b';
      (models || []).forEach(function(m) {
        var name = m.name || m;
        var opt = el('option', { value: name, textContent: name });
        if (name === currentModel) opt.selected = true;
        modelSelect.appendChild(opt);
      });
      if (!models || models.length === 0) {
        modelSelect.appendChild(el('option', { value: '', textContent: 'No models found' }));
      }
    } catch (e) {
      modelSelect.replaceChildren(el('option', { value: '', textContent: 'Failed to load models' }));
    }

    container.append(
      el('div', { className: 'form-group' }, [
        el('label', { className: 'form-label', textContent: 'Ollama URL' }),
        urlInput
      ]),
      el('div', { style: { marginBottom: '12px' } }, [testBtn]),
      statusEl,
      el('div', { className: 'form-group', style: { marginTop: '16px' } }, [
        el('label', { className: 'form-label', textContent: 'Model' }),
        modelSelect
      ]),
      saveModelBtn,
      modelInfo
    );
  } catch (err) {
    container.replaceChildren(el('p', { className: 'status-msg error', textContent: 'Failed to load Ollama settings' }));
  }
}

// --- Tab: Backup ---
function loadBackupTab(container) {
  container.replaceChildren();

  var exportBtn = el('button', { className: 'btn btn-secondary', textContent: 'Export Backup', onclick: function() {
    window.location.href = '/api/backup/export';
  }});

  var statusEl = el('div', { className: 'status-msg hidden' });

  var fileInput = el('input', { type: 'file', accept: '.gz', style: { display: 'none' } });
  var importBtn = el('button', { className: 'btn btn-secondary', textContent: 'Import Backup', onclick: function() { fileInput.click(); } });

  fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    if (!confirm('This will replace all data. Are you sure?')) { fileInput.value = ''; return; }
    importBtn.disabled = true;
    importBtn.textContent = 'Importing...';
    try {
      var res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/gzip' },
        body: fileInput.files[0]
      });
      var data = await res.json();
      if (data.ok) {
        statusEl.textContent = 'Backup restored. Server restarting...';
        statusEl.className = 'status-msg success';
      } else {
        statusEl.textContent = data.error || 'Import failed';
        statusEl.className = 'status-msg error';
      }
    } catch (e) {
      statusEl.textContent = 'Import failed: ' + e.message;
      statusEl.className = 'status-msg error';
    }
    importBtn.disabled = false;
    importBtn.textContent = 'Import Backup';
    fileInput.value = '';
  });

  container.append(
    el('div', { className: 'form-group' }, [
      el('div', { className: 'form-label', textContent: 'Database Backup' }),
      el('div', { textContent: 'Export or import a compressed backup of the entire database.', style: { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' } })
    ]),
    el('div', { style: { display: 'flex', gap: '8px' } }, [exportBtn, importBtn, fileInput]),
    statusEl
  );
}

// --- Tab: Log ---
async function loadLogTab(container) {
  container.textContent = 'Loading run history...';
  container.prepend(el('span', { className: 'mini-spinner' }));
  try {
    var res = await fetch('/api/pipeline/runs');
    var runsData = await res.json();
    var runs = runsData.runs;
    container.replaceChildren();

    if (!runs || runs.length === 0) {
      container.appendChild(el('div', { textContent: 'No pipeline runs yet.', style: { fontSize: '13px', color: 'var(--text-dim)', padding: '20px 0' } }));
      return;
    }

    var currentLogLevel = 'INFO';
    var list = el('div', { className: 'run-list' });

    runs.forEach(function(run) {
      var statusClass = (run.status === 'complete' || run.status === 'completed') ? 'success' : run.status === 'cancelled' ? 'cancelled' : run.status === 'running' ? 'running' : 'error';
      var stats = [
        run.items_collected ? run.items_collected + ' collected' : null,
        run.items_curated ? run.items_curated + ' curated' : null,
      ].filter(Boolean).join(', ');

      var logViewer = el('div', { className: 'log-viewer hidden' });
      var logLoaded = false;

      var item = el('div', { className: 'run-item', onclick: async function() {
        logViewer.classList.toggle('hidden');
        if (!logLoaded) {
          logLoaded = true;
          logViewer.replaceChildren(el('span', { className: 'mini-spinner' }));
          try {
            var logRes = await fetch('/api/logs/' + run.run_id);
            var logData = await logRes.json();
            renderLogEntries(logViewer, logData.entries, currentLogLevel);
          } catch (e) {
            logViewer.textContent = 'Failed to load log';
          }
        }
      }}, [
        el('div', { className: 'run-status-dot ' + statusClass }),
        el('div', { className: 'run-info' }, [
          el('div', { className: 'run-date', textContent: (run.started_at || '').replace('T', ' ').slice(0, 19) }),
          el('div', { className: 'run-stats', textContent: (run.trigger || 'unknown') + (stats ? ' | ' + stats : '') })
        ])
      ]);

      list.appendChild(item);
      list.appendChild(logViewer);
    });

    // Log level filter
    var filters = el('div', { className: 'log-filters' });
    ['DEBUG', 'INFO', 'WARN', 'ERROR'].forEach(function(level) {
      var btn = el('button', {
        className: 'log-filter-btn' + (level === currentLogLevel ? ' active' : ''),
        textContent: level,
        onclick: function() {
          currentLogLevel = level;
          filters.querySelectorAll('.log-filter-btn').forEach(function(b) { b.classList.toggle('active', b.textContent === level); });
          list.querySelectorAll('.log-viewer:not(.hidden)').forEach(function(viewer) {
            if (viewer._entries) renderLogEntries(viewer, viewer._entries, level);
          });
        }
      });
      filters.appendChild(btn);
    });

    container.append(filters, list);
  } catch (err) {
    container.replaceChildren(el('p', { className: 'status-msg error', textContent: 'Failed to load run history' }));
  }
}

var LEVEL_ORDER = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

function renderLogEntries(viewer, entries, minLevel) {
  viewer._entries = entries;
  viewer.replaceChildren();
  var minOrd = LEVEL_ORDER[minLevel] || 0;
  var filtered = entries.filter(function(e) { return (LEVEL_ORDER[e.level] || 0) >= minOrd; });
  if (filtered.length === 0) {
    viewer.appendChild(el('div', { textContent: 'No entries at this level', style: { color: 'var(--text-dim)' } }));
    return;
  }
  filtered.forEach(function(entry) {
    var cls = (entry.level || 'info').toLowerCase();
    var ts = (entry.timestamp || '').split('T').pop().slice(0, 8);
    viewer.appendChild(el('div', {
      className: 'log-entry ' + cls,
      textContent: ts + ' [' + (entry.level || '?') + '] ' + (entry.component ? entry.component + ': ' : '') + (entry.message || '')
    }));
  });
}

// ============================================================
// 8. Pipeline Monitor
// ============================================================

var PIPELINE_STAGES = ['Collect', 'Filter', 'Cluster', 'Rank', 'Extract', 'Write', 'Edit', 'Assemble'];
var STAGE_DESCRIPTIONS = {
  collect: 'Collecting items from configured sources',
  filter: 'Dropping old news and filler',
  cluster: 'Grouping the same story from different outlets',
  rank: 'Choosing the stories worth writing up',
  extract: 'Fetching the full articles',
  write: 'Writing stories',
  edit: 'Choosing what matters',
  assemble: 'Assembling the final briefing'
};
var pipelineSSE = null;
var pipelineActiveStage = null;
var pipelineStageProgress = {};
var pipelineStatusInterval = null;

// Circular progress ring
var RING_RADIUS = 16;
var RING_STROKE = 3;
var RING_SIZE = (RING_RADIUS + RING_STROKE) * 2;
var RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function createStageRing(id) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', RING_SIZE);
  svg.setAttribute('height', RING_SIZE);
  svg.setAttribute('viewBox', '0 0 ' + RING_SIZE + ' ' + RING_SIZE);
  svg.setAttribute('class', 'stage-ring');
  svg.id = id;

  var cx = RING_SIZE / 2;
  var cy = RING_SIZE / 2;

  // Background track
  var bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bg.setAttribute('cx', cx);
  bg.setAttribute('cy', cy);
  bg.setAttribute('r', RING_RADIUS);
  bg.setAttribute('class', 'stage-ring-bg');
  svg.appendChild(bg);

  // Progress arc
  var arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  arc.setAttribute('cx', cx);
  arc.setAttribute('cy', cy);
  arc.setAttribute('r', RING_RADIUS);
  arc.setAttribute('class', 'stage-ring-progress');
  arc.setAttribute('stroke-dasharray', RING_CIRCUMFERENCE);
  arc.setAttribute('stroke-dashoffset', RING_CIRCUMFERENCE);
  arc.setAttribute('transform', 'rotate(-90 ' + cx + ' ' + cy + ')');
  svg.appendChild(arc);

  // Centre icon container
  var fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  fo.setAttribute('x', cx - 8);
  fo.setAttribute('y', cy - 8);
  fo.setAttribute('width', 16);
  fo.setAttribute('height', 16);
  var iconDiv = document.createElement('div');
  iconDiv.className = 'stage-ring-icon';
  iconDiv.id = id + '-icon';
  fo.appendChild(iconDiv);
  svg.appendChild(fo);

  return svg;
}

function setRingProgress(stageKey, fraction) {
  var ring = $('#stage-' + stageKey);
  if (!ring) return;
  var arc = ring.querySelector('.stage-ring-progress');
  if (!arc) return;
  var offset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, fraction)));
  arc.setAttribute('stroke-dashoffset', offset);
}

function resetAllRings() {
  PIPELINE_STAGES.forEach(function(name) {
    var key = name.toLowerCase();
    var ring = $('#stage-' + key);
    if (ring) ring.removeAttribute('data-state');
    setRingProgress(key, 0);
    var iconDiv = $('#stage-' + key + '-icon');
    if (iconDiv) iconDiv.replaceChildren();
    var statEl = $('#stage-stat-' + key);
    if (statEl) statEl.textContent = '';
  });
  var bar = $('#pipeline-bar-fill');
  if (bar) bar.style.width = '0%';
  var logEl = $('#pipeline-log');
  if (logEl) logEl.replaceChildren();
}

function setRingState(stageKey, state) {
  var ring = $('#stage-' + stageKey);
  if (!ring) return;
  ring.setAttribute('data-state', state);
  var iconDiv = $('#stage-' + stageKey + '-icon');
  if (!iconDiv) return;
  iconDiv.replaceChildren();
  if (state === 'complete') {
    setTrustedSVG(iconDiv, ICONS.check);
    setRingProgress(stageKey, 1);
  } else if (state === 'error') {
    setTrustedSVG(iconDiv, ICONS.x);
  }
}

$('#btn-pipeline').addEventListener('click', function() {
  router.toggle('/pipeline');
});

$('#btn-close-pipeline').addEventListener('click', function() {
  router.navigate('/');
});

function openPipelinePanel() {
  renderPipelineContent();
  pipelineStatusInterval = setInterval(pollPipelineStatus, 30000);
  pollPipelineStatus();
  restorePipelineState();
}

function closePipelinePanel() {
  if (pipelineStatusInterval) { clearInterval(pipelineStatusInterval); pipelineStatusInterval = null; }
}

// Each stage logs a specific summary message when it completes.
// We match these to determine which stages actually finished.
var STAGE_COMPLETE_PATTERNS = {
  collect: /^Collection complete:/,
  filter: /^Filtered \d+ items:/,
  cluster: /^Clustered \d+ items/,
  rank: /^Ranked \d+ stories:/,
  extract: /^Extracted \d+ stories:/,
  write: /^Wrote \d+ stories/,
  edit: /^Edited: \d+ top, \d+ in sections/,
  assemble: /^Assembled briefing:/
};
var STAGE_COMPLETE_COMPONENTS = {
  collect: 'collector',
  filter: 'pipeline:filter',
  cluster: 'pipeline:cluster',
  rank: 'pipeline:rank',
  extract: 'pipeline:extract',
  write: 'pipeline:writer',
  edit: 'pipeline:editor',
  assemble: 'assembler'
};

function detectCompletedStages(entries) {
  var completed = new Set();
  entries.forEach(function(e) {
    PIPELINE_STAGES.forEach(function(name) {
      var key = name.toLowerCase();
      var comp = STAGE_COMPLETE_COMPONENTS[key];
      var pattern = STAGE_COMPLETE_PATTERNS[key];
      if (e.component === comp && pattern && pattern.test(e.message)) {
        completed.add(key);
      }
    });
  });
  return completed;
}

async function restorePipelineState() {
  try {
    var res = await fetch('/api/pipeline/status');
    var status = await res.json();
    var logEl = $('#pipeline-log');
    var idleEl = $('#pipeline-idle');

    if (status.running && status.currentRun) {
      // Restore rings for completed stages
      var currentStage = status.currentRun.stage;
      var stageIdx = PIPELINE_STAGES.findIndex(function(s) { return s.toLowerCase() === currentStage; });
      for (var i = 0; i < stageIdx; i++) {
        setRingState(PIPELINE_STAGES[i].toLowerCase(), 'complete');
      }
      var ring = $('#stage-' + currentStage);
      if (ring) ring.setAttribute('data-state', 'running');
      // Restore progress for current and completed stages from tracked data
      for (var si = 0; si <= stageIdx; si++) {
        var sk = PIPELINE_STAGES[si].toLowerCase();
        var prog = pipelineStageProgress[sk];
        if (prog && prog.total > 0) {
          setRingProgress(sk, prog.current / prog.total);
          var se = $('#stage-stat-' + sk);
          if (se) se.textContent = prog.current + '/' + prog.total;
        }
      }
      var bar = $('#pipeline-bar-fill');
      if (bar) bar.style.width = ((stageIdx + 0.5) / PIPELINE_STAGES.length * 100) + '%';

      // Load log entries so far
      if (idleEl) idleEl.classList.add('hidden');
      showCancelButton(true);
      if (logEl) {
        logEl.classList.remove('hidden');
        var logRes = await fetch('/api/pipeline/runs/' + status.currentRun.runId + '/log');
        var logData = await logRes.json();
        if (logData.entries && logData.entries.length) {
          renderLogEntries(logEl, logData.entries, 'info');
          logEl.scrollTop = logEl.scrollHeight;
        }
      }
    } else if (status.lastRun) {
      // Load last run's log
      var entries2 = [];
      if (logEl) {
        logEl.classList.remove('hidden');
        var logRes2 = await fetch('/api/pipeline/runs/' + status.lastRun.run_id + '/log');
        var logData2 = await logRes2.json();
        entries2 = logData2.entries || [];
        if (entries2.length) {
          renderLogEntries(logEl, entries2, 'info');
        }
      }
      // Detect which stages truly completed via their summary log messages
      var completedStages = detectCompletedStages(entries2);
      var isSuccess = status.lastRun.status === 'complete' || status.lastRun.status === 'completed';
      var lastCompletedIdx = -1;
      PIPELINE_STAGES.forEach(function(name, idx) {
        var key = name.toLowerCase();
        if (completedStages.has(key)) {
          setRingState(key, 'complete');
          lastCompletedIdx = idx;
        }
      });
      // If the run failed, mark the next stage after the last completed one as error
      if (!isSuccess && lastCompletedIdx < PIPELINE_STAGES.length - 1) {
        var failedKey = PIPELINE_STAGES[lastCompletedIdx + 1].toLowerCase();
        setRingState(failedKey, 'error');
      }
      var completedCount = lastCompletedIdx + 1 + (isSuccess ? 0 : 0.5);
      var bar2 = $('#pipeline-bar-fill');
      if (bar2) bar2.style.width = (completedCount / PIPELINE_STAGES.length * 100) + '%';
    }
  } catch (e) { /* ignore */ }
}

function renderPipelineContent() {
  var container = $('#pipeline-content');
  container.replaceChildren();

  // Stage indicators
  var stages = el('div', { className: 'pipeline-stages', id: 'pipeline-stages' });
  PIPELINE_STAGES.forEach(function(name) {
    var key = name.toLowerCase();
    var stageEl = el('div', { className: 'pipeline-stage', 'data-stage': key, title: STAGE_DESCRIPTIONS[key] || name });
    stageEl.appendChild(createStageRing('stage-' + key));
    stageEl.appendChild(el('div', { className: 'stage-label', textContent: name }));
    stageEl.appendChild(el('div', { className: 'stage-stat', id: 'stage-stat-' + name.toLowerCase() }));
    stages.appendChild(stageEl);
  });
  container.appendChild(stages);

  // Progress bar
  container.appendChild(el('div', { className: 'pipeline-bar' }, [
    el('div', { className: 'pipeline-bar-fill', id: 'pipeline-bar-fill', style: { width: '0%' } })
  ]));

  // Log area
  container.appendChild(el('div', { className: 'pipeline-log', id: 'pipeline-log' }));

  // Idle area
  container.appendChild(el('div', { className: 'pipeline-idle', id: 'pipeline-idle' }, [
    el('div', { textContent: 'Idle' }),
    el('div', { className: 'pipeline-last-run', id: 'pipeline-last-run' }),
  ]));

  // Action buttons (outside idle so they stay visible during runs)
  container.appendChild(el('div', { className: 'pipeline-actions', id: 'pipeline-actions', style: { marginTop: '10px', textAlign: 'center' } }, [
    el('button', {
      className: 'btn btn-primary',
      id: 'pipeline-run-btn',
      textContent: 'Run Now',
      onclick: async function() {
        var btn = $('#pipeline-run-btn');
        btn.disabled = true;
        btn.textContent = 'Starting...';
        try {
          await fetch('/api/pipeline/run', { method: 'POST' });
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Run Now';
        }
      }
    }),
    el('button', {
      className: 'btn btn-danger hidden',
      id: 'pipeline-cancel-btn',
      textContent: 'Cancel Run',
      onclick: async function() {
        var btn = $('#pipeline-cancel-btn');
        btn.disabled = true;
        btn.textContent = 'Cancelling...';
        try {
          await fetch('/api/pipeline/cancel', { method: 'POST' });
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Cancel Run';
        }
      }
    })
  ]));

  container.appendChild(el('div', { className: 'status-paper-panels' }, [
    el('section', { className: 'status-paper-panel alert-checks', id: 'alert-checks' }, [
      el('h3', { textContent: 'Urgent checks' }),
      el('p', { className: 'alert-checks-empty', textContent: 'Loading today’s checks…' })
    ]),
    el('section', { className: 'status-paper-panel learning-panel', id: 'learning-panel' }, [
      el('h3', { textContent: 'What the paper has learned' }),
      el('p', { className: 'learning-empty', textContent: 'Loading…' })
    ])
  ]));
  loadAlertChecks();
  loadLearningPanel();

  // Run history
  container.appendChild(el('div', { id: 'pipeline-history', style: { marginTop: '16px' } }));
}

async function loadAlertChecks() {
  var container = $('#alert-checks');
  if (!container) return;
  try {
    var response = await fetch('/api/alerts/checks');
    var result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load checks');
    container.replaceChildren(el('h3', { textContent: 'Urgent checks' }));
    if (!result.checks || result.checks.length === 0) {
      container.appendChild(el('p', { className: 'alert-checks-empty', textContent: 'No checks today.' }));
      return;
    }
    result.checks.forEach(function(check) {
      var time = new Date(check.started_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
      var sources = check.sources_read || [];
      var card = el('article', { className: 'alert-check' });
      card.appendChild(el('div', { className: 'alert-check-heading' }, [
        el('strong', { textContent: time }),
        el('span', { textContent: check.status })
      ]));
      card.appendChild(el('p', {
        className: 'alert-check-meta',
        textContent: sources.length + ' sources · ' + check.items_seen + ' recent items · ' + check.candidates_count + ' candidates'
      }));
      if (sources.length) {
        card.appendChild(el('details', { className: 'alert-check-sources' }, [
          el('summary', { textContent: 'Sources read' }),
          el('p', { textContent: sources.join(', ') })
        ]));
      }
      if (check.error) card.appendChild(el('p', { className: 'alert-check-note', textContent: check.error }));
      (check.candidates || []).forEach(function(candidate) {
        var outcome = candidate.sent ? 'Sent' : 'Not sent';
        var why = candidate.reason || candidate.not_sent_reason || 'No reason recorded';
        card.appendChild(el('div', { className: 'alert-candidate' }, [
          el('strong', { textContent: candidate.headline }),
          el('span', { textContent: outcome + ' · ' + why })
        ]));
      });
      container.appendChild(card);
    });
  } catch (error) {
    container.replaceChildren(
      el('h3', { textContent: 'Urgent checks' }),
      el('p', { className: 'alert-checks-empty', textContent: 'Checks could not be loaded.' })
    );
  }
}

function learningSentence(nudge) {
  var name = nudge.display_value || nudge.feature_value;
  if (nudge.feature_type === 'kicker' && name) name = name.charAt(0).toUpperCase() + name.slice(1);
  if (nudge.feature_type === 'outlet') {
    return nudge.nudge > 0
      ? 'You open stories from ' + name + ' more than most: nudged up a little.'
      : 'You rarely open stories from ' + name + ': nudged down.';
  }
  return nudge.nudge > 0
    ? 'You open ' + name + ' stories more than most: nudged up a little.'
    : 'You rarely open ' + name + ' stories: nudged down.';
}

function learningTime(value) {
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-AU', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
  }).toLowerCase();
}

async function loadLearningPanel() {
  var container = $('#learning-panel');
  if (!container) return;
  try {
    var response = await fetch('/api/learning');
    var result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load learning');
    var nudges = (result.nudges || []).filter(function(nudge) { return Number(nudge.nudge) !== 0; });
    var children = [el('h3', { textContent: 'What the paper has learned' })];
    if (nudges.length === 0) {
      children.push(el('p', {
        className: 'learning-empty',
        textContent: 'Nothing yet. Read a few more papers and check back.'
      }));
    } else {
      var list = el('div', { className: 'learning-list' });
      nudges.forEach(function(nudge) {
        list.appendChild(el('article', { className: 'learning-item' }, [
          el('p', { textContent: learningSentence(nudge) }),
          el('small', { textContent: nudge.seen_count + ' stories' })
        ]));
      });
      children.push(list);
    }
    if (result.last_computed_at) children.push(el('p', {
      className: 'learning-computed',
      textContent: 'Last worked out ' + learningTime(result.last_computed_at)
    }));
    children.push(el('div', { className: 'learning-actions' }, [
      el('button', {
        className: 'btn btn-primary',
        textContent: 'Work it out now',
        onclick: async function(event) {
          var button = event.currentTarget;
          button.disabled = true;
          button.textContent = 'Working…';
          try {
            var worked = await fetch('/api/learning/recompute', { method: 'POST' });
            if (!worked.ok) throw new Error('Could not work it out');
            await loadLearningPanel();
          } catch (_) {
            button.disabled = false;
            button.textContent = 'Try again';
          }
        }
      }),
      el('button', {
        className: 'btn btn-danger',
        textContent: 'Forget all this',
        onclick: async function(event) {
          if (!confirm('Forget what the paper has learned?')) return;
          var button = event.currentTarget;
          button.disabled = true;
          try {
            var forgotten = await fetch('/api/learning', { method: 'DELETE' });
            if (!forgotten.ok) throw new Error('Could not forget');
            await loadLearningPanel();
          } catch (_) {
            button.disabled = false;
          }
        }
      })
    ]));
    container.replaceChildren.apply(container, children);
  } catch (_) {
    container.replaceChildren(
      el('h3', { textContent: 'What the paper has learned' }),
      el('p', { className: 'learning-empty', textContent: 'Could not load this yet.' })
    );
  }
}

async function pollPipelineStatus() {
  try {
    var res = await fetch('/api/pipeline/status');
    var status = await res.json();
    updatePipelineDot(status);

    if (status.running && status.currentRun) {
      var idleEl = $('#pipeline-idle');
      var logEl = $('#pipeline-log');
      if (idleEl) idleEl.classList.add('hidden');
      if (logEl) logEl.classList.remove('hidden');
      showCancelButton(true);
    } else {
      var idleEl2 = $('#pipeline-idle');
      if (idleEl2) idleEl2.classList.remove('hidden');
      showCancelButton(false);
      if (status.lastRun) {
        var lr = status.lastRun;
        var text = 'Last run: ' + (lr.status || '?') + ' at ' + (lr.started_at || '').replace('T', ' ').slice(0, 19);
        var lastRunEl = $('#pipeline-last-run');
        if (lastRunEl) lastRunEl.textContent = text;
      }
    }

    // Load recent run history
    var runsRes = await fetch('/api/pipeline/runs?limit=5');
    var runsData = await runsRes.json();
    var runs = runsData.runs;
    var historyEl = $('#pipeline-history');
    if (historyEl && runs && runs.length) {
      historyEl.replaceChildren(el('div', { className: 'form-label', textContent: 'Recent Runs' }));
      var runKey = el('div', { className: 'source-key', style: { marginBottom: '8px' } }, [
        el('span', { className: 'source-key-item' }, [el('span', { className: 'run-status-dot success' }), el('span', { textContent: 'Complete' })]),
        el('span', { className: 'source-key-item' }, [el('span', { className: 'run-status-dot error' }), el('span', { textContent: 'Error' })]),
        el('span', { className: 'source-key-item' }, [el('span', { className: 'run-status-dot cancelled' }), el('span', { textContent: 'Cancelled' })]),
        el('span', { className: 'source-key-item' }, [el('span', { className: 'run-status-dot running' }), el('span', { textContent: 'Running' })])
      ]);
      historyEl.appendChild(runKey);
      var histList = el('div', { className: 'run-list' });
      runs.forEach(function(run) {
        var statusClass = (run.status === 'complete' || run.status === 'completed') ? 'success' : run.status === 'cancelled' ? 'cancelled' : run.status === 'running' ? 'running' : 'error';
        var logPanel = el('div', { className: 'run-log-panel hidden' });
        var loaded = false;
        var runItem = el('div', { className: 'run-item', onclick: async function() {
          // Collapse any other open panels
          histList.querySelectorAll('.run-log-panel:not(.hidden)').forEach(function(p) {
            if (p !== logPanel) p.classList.add('hidden');
          });
          logPanel.classList.toggle('hidden');
          if (!loaded && !logPanel.classList.contains('hidden')) {
            loaded = true;
            logPanel.replaceChildren(el('span', { className: 'mini-spinner' }));
            try {
              var logRes = await fetch('/api/pipeline/runs/' + run.run_id + '/log');
              var logData = await logRes.json();
              logPanel.replaceChildren();
              if (logData.entries && logData.entries.length) {
                renderLogEntries(logPanel, logData.entries, 'info');
              } else {
                logPanel.appendChild(el('div', { textContent: 'No log entries', style: { color: 'var(--text-dim)', fontSize: '12px' } }));
              }
            } catch (e) {
              logPanel.replaceChildren(el('div', { textContent: 'Failed to load log', style: { color: 'var(--red)', fontSize: '12px' } }));
              loaded = false;
            }
          }
        }}, [
          el('div', { className: 'run-status-dot ' + statusClass }),
          el('div', { className: 'run-info' }, [
            el('div', { className: 'run-date', textContent: (run.started_at || '').replace('T', ' ').slice(0, 19) }),
            el('div', { className: 'run-stats', textContent: (run.trigger || '') + (run.items_curated ? ' | ' + run.items_curated + ' curated' : '') })
          ])
        ]);
        histList.appendChild(runItem);
        histList.appendChild(logPanel);
      });
      historyEl.appendChild(histList);
    }
    loadAlertChecks();
    loadLearningPanel();
  } catch (e) {
    console.error('Pipeline status poll failed:', e);
  }
}

function connectGlobalSSE() {
  if (pipelineSSE) pipelineSSE.close();
  pipelineSSE = new EventSource('/api/pipeline/events');

  pipelineSSE.addEventListener('message', function(e) {
    try {
      var data = JSON.parse(e.data);
      handlePipelineEvent(data);
    } catch (err) { /* ignore */ }
  });

  pipelineSSE.addEventListener('error', function() {
    // Will auto-reconnect
  });
}

function handlePipelineEvent(data) {
  // Progress events — update ring fill
  if (data.type === 'progress' && data.stage && data.total > 0) {
    pipelineStageProgress[data.stage] = { current: data.current, total: data.total };
    setRingProgress(data.stage, data.current / data.total);
    var statEl = $('#stage-stat-' + data.stage);
    if (statEl) statEl.textContent = data.current + '/' + data.total;
  }

  // Stage events — update ring state
  if (data.stage && data.status) {
    var stageIdx = PIPELINE_STAGES.findIndex(function(s) { return s.toLowerCase() === data.stage.toLowerCase(); });
    if (stageIdx >= 0) {
      // Mark previous stages complete
      for (var i = 0; i < stageIdx; i++) {
        setRingState(PIPELINE_STAGES[i].toLowerCase(), 'complete');
      }
      // Mark current stage
      var stageKey = PIPELINE_STAGES[stageIdx].toLowerCase();
      if (data.status === 'running') {
        pipelineActiveStage = stageKey;
      }
      if (data.status === 'complete' || data.status === 'done') {
        setRingState(stageKey, 'complete');
      } else if (data.status === 'error') {
        setRingState(stageKey, 'error');
      } else if (data.status === 'running') {
        var ring = $('#stage-' + stageKey);
        if (ring) ring.setAttribute('data-state', 'running');
      }
      // Update progress bar
      var progress = ((stageIdx + (data.status === 'complete' || data.status === 'done' ? 1 : 0.5)) / PIPELINE_STAGES.length) * 100;
      var bar = $('#pipeline-bar-fill');
      if (bar) bar.style.width = progress + '%';
    }

    // Stage stats (from complete event)
    if (data.stats && typeof data.stats === 'string') {
      var statEl2 = $('#stage-stat-' + data.stage.toLowerCase());
      if (statEl2) statEl2.textContent = data.stats;
    }
  }

  // Log entry
  if (data.type === 'log' || data.message) {
    var logEl = $('#pipeline-log');
    if (logEl) {
      logEl.classList.remove('hidden');
      var idleEl = $('#pipeline-idle');
      if (idleEl) idleEl.classList.add('hidden');
      var level = (data.level || 'info').toLowerCase();
      logEl.appendChild(el('div', { className: 'log-entry ' + level, textContent: (data.message || '') }));
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  // Pipeline complete
  if (data.type === 'complete' || data.status === 'pipeline_complete') {
    setTimeout(pollPipelineStatus, 500);
    setTimeout(function() { loadBriefing(); }, 2000);
  }

  // Pipeline error or cancelled
  if (data.type === 'error' || data.type === 'cancelled') {
    if (pipelineActiveStage) {
      setRingState(pipelineActiveStage, 'error');
      pipelineActiveStage = null;
    }
    showCancelButton(false);
    setPipelineDotState(data.type === 'cancelled' ? 'cancelled' : 'error');
    pollPipelineStatus();
  }

  // Update header dot and cancel button
  if (data.type === 'start') {
    setPipelineDotState('running');
    showCancelButton(true);
    resetAllRings();
    pipelineActiveStage = null;
    pipelineStageProgress = {};
    // Hide idle, show log
    var idleEl = $('#pipeline-idle');
    var logEl = $('#pipeline-log');
    if (idleEl) idleEl.classList.add('hidden');
    if (logEl) logEl.classList.remove('hidden');
  } else if (data.type === 'complete') {
    setPipelineDotState(data.error ? 'error' : 'success');
    showCancelButton(false);
  }
}

// ============================================================
// 9. Status Indicator
// ============================================================

function showCancelButton(running) {
  var runBtn = $('#pipeline-run-btn');
  var cancelBtn = $('#pipeline-cancel-btn');
  if (running) {
    if (runBtn) runBtn.classList.add('hidden');
    if (cancelBtn) {
      cancelBtn.classList.remove('hidden');
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel Run';
    }
  } else {
    if (runBtn) {
      runBtn.classList.remove('hidden');
      runBtn.disabled = false;
      runBtn.textContent = 'Run Now';
    }
    if (cancelBtn) cancelBtn.classList.add('hidden');
  }
}

function setPipelineDotState(state) {
  var dot = $('#pipeline-dot');
  if (dot) dot.className = 'pipeline-dot ' + state;
}

async function updatePipelineStatus() {
  try {
    var res = await fetch('/api/pipeline/status');
    var status = await res.json();
    updatePipelineDot(status);
  } catch (e) { /* ignore */ }
}

function updatePipelineDot(status) {
  if (status.running) {
    setPipelineDotState('running');
  } else if (status.lastRun) {
    var ls = status.lastRun.status;
    setPipelineDotState(ls === 'complete' || ls === 'completed' ? 'success' : ls === 'cancelled' ? 'cancelled' : 'error');
  } else {
    setPipelineDotState('idle');
  }
}

// ============================================================
// 10. Version Footer
// ============================================================

async function initVersionFooter() {
  var footer = $('#app-footer');
  if (!footer) return;

  // Show current version immediately
  try {
    var statusRes = await fetch('/api/updates/status');
    var status = await statusRes.json();
    var versionEl = $('#footer-version');
    var dotEl = $('#footer-update-dot');
    if (versionEl) versionEl.textContent = 'v' + (status.current || '?');

    // Check for updates in background
    var checkRes = await fetch('/api/updates/check');
    var check = await checkRes.json();

    if (dotEl) {
      if (check.available) {
        dotEl.className = 'footer-dot update-available';
        dotEl.title = 'Update available: v' + check.latest;
        footer.title = 'Current: v' + (status.current || '?') + ' — Latest: v' + check.latest;
      } else if (check.error) {
        dotEl.className = 'footer-dot update-error';
        dotEl.title = 'Update check failed';
      } else {
        dotEl.className = 'footer-dot update-current';
        dotEl.title = 'Up to date';
        footer.title = 'v' + (status.current || '?') + ' — up to date';
      }
    }
  } catch (e) { /* ignore */ }
}

// ============================================================
// 11. Suggestion Banner
// ============================================================

async function checkSuggestions() {
  try {
    var res = await fetch('/api/categories/suggestions');
    var data = await res.json();
    var suggestions = data.suggestions;
    var banner = $('#suggestion-banner');
    if (!suggestions || suggestions.length === 0) {
      banner.classList.add('hidden');
      return;
    }
    banner.classList.remove('hidden');
    banner.replaceChildren();

    var content = el('div', { className: 'suggestion-banner-content' });
    var headerRow = el('div', { className: 'suggestion-header' }, [
      el('span', { textContent: suggestions.length + ' new category suggestion' + (suggestions.length > 1 ? 's' : '') + ' from the LLM' }),
      el('button', {
        className: 'btn-dismiss-all',
        textContent: 'Dismiss All',
        onclick: async function() {
          await fetch('/api/categories/suggestions/dismiss-all', { method: 'POST' });
          checkSuggestions();
        }
      })
    ]);
    content.appendChild(headerRow);

    var actions = el('div', { className: 'suggestion-actions' });
    suggestions.forEach(function(s) {
      actions.appendChild(el('button', {
        className: 'btn-accept',
        textContent: 'Create "' + escapeHtml(s.suggestion) + '"',
        onclick: async function() {
          await fetch('/api/categories/suggestions/' + s.id + '/accept', { method: 'POST' });
          checkSuggestions();
        }
      }));
      actions.appendChild(el('button', {
        className: 'btn-dismiss',
        textContent: 'Dismiss',
        onclick: async function() {
          await fetch('/api/categories/suggestions/' + s.id + '/dismiss', { method: 'POST' });
          checkSuggestions();
        }
      }));
    });
    content.appendChild(actions);
    banner.appendChild(content);
  } catch (e) { /* ignore */ }
}

// ============================================================
// 12. Push Notifications
// ============================================================

var notifVapidKey = null;

async function updateNotifUI() {
  var btn = $('#btn-notif-toggle');
  var testBtn = $('#btn-notif-test');
  var status = $('#notif-status');
  if (!btn || !status) return;

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    btn.disabled = true;
    btn.textContent = 'Not supported';
    status.textContent = 'Push not available';
    if (testBtn) testBtn.disabled = true;
    return;
  }

  if (!notifVapidKey) {
    try {
      var res = await fetch('/api/push/vapid-key');
      var data = await res.json();
      if (!data.publicKey) {
        btn.disabled = true;
        btn.textContent = 'Not configured';
        return;
      }
      notifVapidKey = data.publicKey;
    } catch (e) {
      btn.disabled = true;
      btn.textContent = 'Error';
      return;
    }
  }

  var reg = await navigator.serviceWorker.ready;
  var sub = await reg.pushManager.getSubscription();
  btn.disabled = false;
  if (sub) {
    btn.textContent = 'Disable';
    btn.classList.add('active');
    status.textContent = 'Notifications enabled';
    if (testBtn) testBtn.disabled = false;
  } else {
    btn.textContent = 'Enable';
    btn.classList.remove('active');
    status.textContent = '';
    if (testBtn) testBtn.disabled = true;
  }
}

function bindNotifToggle() {
  var btn = $('#btn-notif-toggle');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async function() {
    var btn = $('#btn-notif-toggle');
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

function bindNotifTest() {
  var btn = $('#btn-notif-test');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async function() {
    var status = $('#notif-status');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      var response = await fetch('/api/push/test', { method: 'POST' });
      var result = await response.json();
      if (!response.ok || !result.sent) throw new Error(result.error || 'No notification was sent');
      status.textContent = 'Test sent';
    } catch (error) {
      status.textContent = 'Test failed';
    }
    btn.textContent = 'Send me a test';
    await updateNotifUI();
  });
}
bindNotifTest();

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(base64);
  var arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ============================================================
// 13. PWA Install
// ============================================================

var deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredInstallPrompt = e;
  updateInstallUI();
});

window.addEventListener('appinstalled', function() {
  deferredInstallPrompt = null;
  updateInstallUI();
});

function updateInstallUI() {
  var btn = $('#btn-install');
  var status = $('#install-status');
  if (!btn) return;

  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
    btn.disabled = true;
    btn.textContent = 'Installed';
    status.textContent = 'Running as app';
  } else if (deferredInstallPrompt) {
    btn.disabled = false;
    btn.textContent = 'Install';
    status.textContent = '';
  } else {
    btn.disabled = true;
    btn.textContent = 'Install';
    status.textContent = 'Not available';
  }
}

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

updateInstallUI();

// ============================================================
// 14b. Router
// ============================================================

var router = (function() {
  var ROUTES = {
    '/':         { viewId: 'reading-stage',      btnId: null,           title: 'Daily Briefing' },
    '/settings': { viewId: 'settings-panel',     btnId: 'btn-settings', title: 'Daily Briefing — Settings' },
    '/archive':  { viewId: 'archive-panel',      btnId: 'btn-archive',  title: 'Daily Briefing — Previous editions' },
    '/pipeline': { viewId: 'pipeline-panel',     btnId: 'btn-pipeline', title: 'Daily Briefing — Status' },
  };
  var currentPath = null;

  function normalize(path) {
    return ROUTES[path] ? path : '/';
  }

  function onEnter(path) {
    if (path === '/') {
      loadReadingFromLocation();
    } else if (path === '/settings') {
      settingsPageLoadPromise = loadSettingsPage();
    } else if (path === '/archive') {
      loadArchive();
    } else if (path === '/pipeline') {
      openPipelinePanel();
    }
  }

  function onLeave(path) {
    if (path === '/pipeline') {
      closePipelinePanel();
    } else if (path === '/archive') {
      rememberArchivePosition();
    } else if (path === '/') {
      resetReadingStage();
    }
  }

  function render(rawPath) {
    var path = normalize(rawPath);
    if (currentPath && currentPath !== path) onLeave(currentPath);

    var appRoot = document.getElementById('app');
    if (appRoot) appRoot.dataset.view = path === '/' ? 'reading' : path.slice(1);
    if (path === '/') {
      scheduleMastheadMeasure();
    } else {
      clearMastheadPresentation();
      mastheadState.metrics = null;
    }
    updateThemeColour();

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
    document.title = path === '/' && currentDate
      ? formatDate(currentDate) + ' \u2014 ' + appTitle
      : ROUTES[path].title;

    if (currentPath !== path) onEnter(path);
    currentPath = path;
  }

  function navigate(target, state) {
    var url = new URL(target, location.origin);
    var path = normalize(url.pathname);
    var destination = path + (path === url.pathname ? url.search : '');
    if (destination === location.pathname + location.search) return;
    history.pushState(state || {}, '', destination);
    if (path === currentPath) {
      if (path === '/') loadReadingFromLocation();
      return;
    }
    render(path);
  }

  function toggle(path) {
    navigate(currentPath === path ? '/' : path);
  }

  function init() {
    window.addEventListener('popstate', function() {
      render(location.pathname);
      if (normalize(location.pathname) === '/') loadReadingFromLocation();
    });
    render(location.pathname);
  }

  return { init: init, navigate: navigate, toggle: toggle };
})();

// ============================================================
// 14. Keyboard shortcuts
// ============================================================

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (readingState.readerOpen) returnFromReader();
    else router.navigate('/');
  }
});

// ============================================================
// 15. Init
// ============================================================

// Load app title from settings
loadAppTitle();

// Pipeline status indicator + global SSE
updatePipelineStatus();
connectGlobalSSE();

// Version footer + update check
initVersionFooter();

// Notification UI
updateNotifUI();

// Service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(function(err) {
    console.log('SW registration failed:', err);
  });
}

// Poll pipeline status every 30s
setInterval(updatePipelineStatus, 30000);

// Initialize the router last so it can read the current URL and activate
// the matching view after all bindings are in place.
router.init();

if (document.fonts) {
  document.fonts.ready.then(scheduleMastheadMeasure);
  if (document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', scheduleMastheadMeasure);
  }
}
