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
  return d.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
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

// Close any currently-open inline edit form (source or category).
// Removes the .editing class from the row and detaches the form node.
function closeOpenEditForm() {
  var open = document.querySelector('.source-item.editing, .category-item.editing');
  if (!open) return;
  open.classList.remove('editing');
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
  var reading = $('#app') && $('#app').dataset.view === 'reading';
  var property = reading ? '--paper-page' : '--bg';
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
var readingStories = new Map();
var readingStoryKeys = new Map();
var readingStoryToggles = new Map();
var readingFallbackId = 0;
var readingControlId = 0;
var expandedStory = null;
var briefingLoaded = false;
var curlState = { progress: 0, cornerY: 0, sign: 1, dragY: 0, animation: null, gesture: null };
var suppressCurlClick = false;
var suppressCurlClickTimer = null;
var readingState = {
  readerOpen: false,
  storyId: null,
  openerId: null,
  briefingScrollTop: 0,
  appHistoryEntry: false
};

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
    clearCurlPresentation();
    return;
  }
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
  if (readingState.appHistoryEntry && history.state && history.state.appHistoryEntry) {
    history.back();
  } else {
    history.replaceState({}, '', '/');
    closeReader();
  }
}

function reducedForwardTurn(key) {
  if (!prepareReaderForCurl(key)) return;
  var stage = $('#reading-stage');
  stage.classList.add('reduced-turning', 'reduced-turning--forward');
  curlState.animation = { type: 'timer', id: setTimeout(function() {
    curlState.animation = null;
    curlState.progress = 1;
    openReaderById(key, true);
    stage.classList.remove('reduced-turning', 'reduced-turning--forward');
  }, 150) };
}

function reducedBackTurn(complete) {
  var stage = $('#reading-stage');
  stage.classList.add('reduced-turning', 'reduced-turning--back');
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

  var stage = $('#reading-stage');
  var briefingPage = $('#briefing-page');
  var readerPage = $('#reader-page');
  if (stage) stage.classList.remove('reader-active', 'reduced-turning', 'reduced-turning--forward', 'reduced-turning--back');
  setInert(briefingPage, false);
  setInert(readerPage, true);
  if (readerPage) readerPage.setAttribute('aria-hidden', 'true');
  if ($('#reader-header')) $('#reader-header').replaceChildren();
  if ($('#reader-body')) $('#reader-body').replaceChildren();
  if ($('#curl-ghost')) $('#curl-ghost').replaceChildren();
  closeExpandedStory();
  readingState.readerOpen = false;
  readingState.storyId = null;
  readingState.openerId = null;
  readingState.appHistoryEntry = false;
}

function storyKey(item) {
  if (readingStoryKeys.has(item)) return readingStoryKeys.get(item);
  var hasStableId = item && item.id !== undefined && item.id !== null && item.id !== '';
  var key = hasStableId ? String(item.id) : 'legacy-story-' + (++readingFallbackId);
  readingStoryKeys.set(item, key);
  if (!readingStories.has(key)) readingStories.set(key, item);
  return key;
}

function domToken(value) {
  return String(value || 'item').replace(/[^a-zA-Z0-9_-]+/g, '-');
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

function sourceNames(item) {
  return (Array.isArray(item && item.sources) ? item.sources : []).map(function(source) {
    return typeof source === 'string' ? source : source && source.name;
  }).filter(Boolean);
}

// ============================================================
// 5. Paper briefing rendering
// ============================================================

async function loadBriefing(id) {
  var url = id ? '/api/briefing/' + id : '/api/briefing';
  var loading = $('#loading');
  var emptyState = $('#empty-state');
  var container = $('#sections-container');

  resetReadingStage();
  $('#briefing-page').scrollTop = 0;
  readingState.briefingScrollTop = 0;
  briefingLoaded = false;
  readingStories.clear();
  readingStoryKeys.clear();
  readingStoryToggles.clear();
  readingFallbackId = 0;
  readingControlId = 0;
  container.replaceChildren();
  loading.classList.remove('hidden');
  emptyState.classList.add('hidden');

  try {
    var res = await fetch(url);
    var json = await res.json();
    loading.classList.add('hidden');

    if (!json.data || json.error) {
      currentDate = null;
      currentBriefingId = null;
      emptyState.classList.remove('hidden');
      $('#briefing-date').textContent = '';
      $('#briefing-headline').textContent = '';
      briefingLoaded = true;
      syncReaderFromLocation();
      return;
    }

    currentDate = json.date;
    currentBriefingId = json.id;
    var briefing = json.data;

    $('#briefing-date').textContent = formatDate(json.date);
    $('#briefing-headline').textContent = '';
    document.title = formatDate(json.date) + ' \u2014 ' + appTitle;

    $$('.archive-item').forEach(function(archiveItem) {
      archiveItem.classList.toggle('active', archiveItem.dataset.id === String(json.id));
    });

    var prepared = window.ReadingLogic.prepareSections(briefing.sections || []);
    prepared.forEach(function(group) {
      if (group.shown.length === 0 && group.hidden.length === 0) return;
      container.appendChild(renderReadingSection(group));
    });
    refreshCurlGhost();
    briefingLoaded = true;
    syncReaderFromLocation();
  } catch (err) {
    loading.classList.add('hidden');
    emptyState.classList.remove('hidden');
    briefingLoaded = true;
    syncReaderFromLocation();
    console.error('Failed to load briefing:', err);
  }
}

function renderReadingSection(group) {
  var section = group.section;
  var sectionId = section.id || sectionFallbackId(section);
  var isTop = isTopReadingSection(section);
  var sectionDomId = 'reading-section-' + domToken(sectionId) + '-' + (++readingControlId);
  var sectionEl = el('section', {
    className: 'reading-section' + (isTop ? ' reading-section--top' : ''),
    'data-section-id': sectionId
  });
  var title = isTop ? 'You should know' : (section.title || 'News');
  sectionEl.appendChild(el('h2', { className: 'reading-section-label', textContent: title }));

  var shownList = el('div', { className: 'reading-story-list' });
  group.shown.forEach(function(item, index) {
    storyKey(item);
    shownList.appendChild(renderReadingStory(item, isTop && index === 0));
  });
  sectionEl.appendChild(shownList);

  if (group.hidden.length > 0) {
    group.hidden.forEach(storyKey);
    var hiddenId = sectionDomId + '-more';
    var moreButtonId = sectionDomId + '-more-button';
    var hiddenList = el('div', {
      className: 'reading-story-list reading-more-stories',
      id: hiddenId,
      role: 'region',
      'aria-labelledby': moreButtonId,
      hidden: ''
    });
    hiddenList._readingItems = group.hidden;
    var moreButton = el('button', {
      type: 'button',
      className: 'reading-more-button',
      id: moreButtonId,
      'data-reading-action': 'more',
      'aria-controls': hiddenId,
      'aria-expanded': 'false',
      textContent: 'More (' + group.hidden.length + ')'
    });
    sectionEl.append(hiddenList, moreButton);
  }
  return sectionEl;
}

function renderReadingStory(item, lead) {
  var key = storyKey(item);
  var controlToken = domToken(key) + '-' + (++readingControlId);
  var toggleId = 'story-toggle-' + controlToken;
  var detailId = 'story-detail-' + controlToken;
  var story = el('article', {
    className: 'reading-story' + (lead ? ' reading-story--lead' : ''),
    'data-story-id': key
  });
  var summaryChildren = [];
  if (item.kicker) summaryChildren.push(el('span', { className: 'reading-story-kicker', textContent: item.kicker }));
  summaryChildren.push(el('span', { className: 'reading-story-title', textContent: item.title || 'Untitled story' }));
  if (item.summary) summaryChildren.push(el('span', { className: 'reading-story-summary', textContent: item.summary }));
  var toggle = el('button', {
    type: 'button',
    className: 'reading-story-toggle',
    id: toggleId,
    'data-reading-action': 'toggle',
    'data-story-id': key,
    'aria-expanded': 'false',
    'aria-controls': detailId
  }, summaryChildren);
  if (!readingStoryToggles.has(key)) readingStoryToggles.set(key, toggle);

  var innerChildren = [];
  if (item.detail) innerChildren.push(el('p', { className: 'reading-story-detail-text', textContent: item.detail }));
  var names = sourceNames(item);
  var time = readingTimeText(item.reading_time);
  if (names.length || time) {
    var meta = el('div', { className: 'reading-story-meta' });
    if (names.length) meta.appendChild(el('span', { textContent: names.join(' · ') }));
    if (time) meta.appendChild(el('span', { textContent: time }));
    innerChildren.push(meta);
  }
  innerChildren.push(el('button', {
    type: 'button',
    className: 'read-full-button',
    'data-reading-action': 'read',
    'data-story-id': key,
    textContent: 'Read in full'
  }));
  var detailInner = el('div', { className: 'reading-story-detail-inner' }, innerChildren);
  var overflow = el('div', { className: 'reading-story-detail-overflow' }, [detailInner]);
  var detail = el('div', {
    className: 'reading-story-detail',
    id: detailId,
    role: 'region',
    'aria-labelledby': toggleId,
    'aria-hidden': 'true',
    inert: ''
  }, [overflow]);
  story.append(toggle, detail);
  return story;
}

function closeExpandedStory() {
  if (!expandedStory) return;
  expandedStory.classList.remove('expanded');
  var toggle = expandedStory.querySelector('.reading-story-toggle');
  var detail = expandedStory.querySelector('.reading-story-detail');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  if (detail) {
    detail.setAttribute('aria-hidden', 'true');
    setInert(detail, true);
  }
  expandedStory = null;
}

function toggleReadingStory(story) {
  var wasExpanded = story === expandedStory;
  closeExpandedStory();
  if (wasExpanded) {
    refreshCurlGhost();
    return;
  }
  expandedStory = story;
  story.classList.add('expanded');
  var toggle = story.querySelector('.reading-story-toggle');
  var detail = story.querySelector('.reading-story-detail');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
  if (detail) {
    detail.setAttribute('aria-hidden', 'false');
    setInert(detail, false);
  }
  refreshCurlGhost();
}

function toggleMoreStories(button) {
  var hiddenList = document.getElementById(button.getAttribute('aria-controls'));
  if (!hiddenList) return;
  var opening = button.getAttribute('aria-expanded') !== 'true';
  if (opening) {
    if (hiddenList.dataset.rendered !== 'true') {
      hiddenList._readingItems.forEach(function(item) {
        hiddenList.appendChild(renderReadingStory(item, false));
      });
      hiddenList.dataset.rendered = 'true';
    }
    hiddenList.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.textContent = 'Show less';
    refreshCurlGhost();
    return;
  }

  var focusWasInside = hiddenList.contains(document.activeElement);
  if (expandedStory && hiddenList.contains(expandedStory)) closeExpandedStory();
  hiddenList.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  button.textContent = 'More (' + hiddenList._readingItems.length + ')';
  if (focusWasInside) button.focus();
  refreshCurlGhost();
}

$('#briefing-page').addEventListener('click', function(event) {
  var button = event.target.closest('button[data-reading-action]');
  if (!button || !event.currentTarget.contains(button)) return;
  var action = button.dataset.readingAction;
  if (action === 'toggle') {
    var story = button.closest('.reading-story');
    if (story) toggleReadingStory(story);
  } else if (action === 'more') {
    toggleMoreStories(button);
  } else if (action === 'read') {
    event.stopPropagation();
    startForwardTurn(button.dataset.storyId);
  }
});

// ============================================================
// 5b. Full article reader and history
// ============================================================

function firstSafeSourceUrl(item) {
  var sources = Array.isArray(item && item.sources) ? item.sources : [];
  for (var index = 0; index < sources.length; index++) {
    var sourceUrl = typeof sources[index] === 'object' && sources[index] ? sources[index].url : '';
    var safe = safeUrl(sourceUrl);
    if (safe) return safe;
  }
  return '';
}

function originalUrl(item) {
  return safeUrl(item && item.article_url) || safeUrl(item && item.canonical_url) || firstSafeSourceUrl(item);
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

  var heroUrl = safeUrl(item.image);
  if (heroUrl) {
    var hero = el('img', { className: 'reader-hero', src: heroUrl, alt: item.image_alt || '', loading: 'eager' });
    hero.addEventListener('error', function() { hero.remove(); });
    body.appendChild(hero);
  }

  var hasArticle = false;
  if (typeof item.article_html === 'string' && item.article_html.trim()) {
    var template = document.createElement('template');
    // Stage 2 sanitises article_html on the server to the reader allow-list.
    // This is the sole data-backed HTML parsing boundary in the frontend.
    template.innerHTML = item.article_html;
    hasArticle = Boolean(template.content.textContent.trim() || template.content.querySelector('img'));
    if (hasArticle) body.appendChild(template.content.cloneNode(true));
  }
  if (!hasArticle && item.summary) body.appendChild(el('p', { className: 'reader-fallback', textContent: item.summary }));

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
  if (!readingState.readerOpen) readingState.briefingScrollTop = $('#briefing-page').scrollTop;
  renderReader(item);
  readingState.readerOpen = true;
  readingState.storyId = key;
  readingState.openerId = key;
  readingState.appHistoryEntry = Boolean(appHistoryEntry);
  $('#reader-page').scrollTop = 0;
  setInert($('#briefing-page'), true);
  setInert($('#reader-page'), false);
  $('#reader-page').setAttribute('aria-hidden', 'false');
  curlState.progress = 1;
  curlState.dragY = 0;
  renderCurl();
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
  readingState.readerOpen = false;
  readingState.storyId = null;
  readingState.appHistoryEntry = false;
  $('#reading-stage').classList.remove('reader-active');
  curlState.progress = 0;
  curlState.dragY = 0;
  renderCurl();
  setInert($('#reader-page'), true);
  $('#reader-page').setAttribute('aria-hidden', 'true');
  setInert($('#briefing-page'), false);
  $('#briefing-page').scrollTop = readingState.briefingScrollTop;
  requestAnimationFrame(function() {
    $('#briefing-page').scrollTop = readingState.briefingScrollTop;
    var toggle = readingStoryToggles.get(openerId);
    if (toggle && !toggle.closest('[hidden]')) toggle.focus();
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
    history.replaceState({}, '', '/');
    closeReader();
    return;
  }
  if (readingState.readerOpen && readingState.storyId === key) return;
  showReader(readingStories.get(key), key, Boolean(state.appHistoryEntry));
}

$('#reader-back').addEventListener('click', returnFromReader);

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
  } else {
    animateCurlTo(1, function() { $('#reading-stage').classList.add('reader-active'); });
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
    if (decision === 'forward' && !prepareReaderForCurl(gesture.storyId)) {
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
  if (curlState.gesture && curlState.gesture.story && !curlState.gesture.story.isConnected) {
    finishCurlGesture(true);
    return;
  }
  renderCurl();
}

window.addEventListener('resize', rerenderCurlAfterResize);
window.addEventListener('orientationchange', rerenderCurlAfterResize);

// ============================================================
// 6. Archive
// ============================================================

var ARCHIVE_PAGE_SIZE = 20;
var archiveBriefings = [];
var archivePage = 0;

async function loadArchive() {
  try {
    var res = await fetch('/api/briefings');
    var json = await res.json();
    archiveBriefings = json.briefings || [];
    archivePage = 0;
    if (currentBriefingId) {
      var idx = archiveBriefings.findIndex(function(b) { return b.id === currentBriefingId; });
      if (idx >= 0) archivePage = Math.floor(idx / ARCHIVE_PAGE_SIZE);
    }
    renderArchivePage();
  } catch (err) {
    console.error('Failed to load archive:', err);
  }
}

function formatArchiveTime(createdAt) {
  if (!createdAt) return '';
  // created_at is like "2026-04-11 09:36:36" — extract time portion
  var timePart = (createdAt.includes('T') ? createdAt.split('T')[1] : createdAt.split(' ')[1]) || '';
  return timePart.slice(0, 5);
}

function renderArchivePage() {
  var list = $('#archive-list');
  list.replaceChildren();

  var totalPages = Math.ceil(archiveBriefings.length / ARCHIVE_PAGE_SIZE);
  var start = archivePage * ARCHIVE_PAGE_SIZE;
  var page = archiveBriefings.slice(start, start + ARCHIVE_PAGE_SIZE);

  page.forEach(function(b) {
    var timeStr = formatArchiveTime(b.created_at);
    var item = el('div', {
      className: 'archive-item' + (b.id === currentBriefingId ? ' active' : ''),
      'data-id': b.id,
      onclick: function() { loadBriefing(b.id); }
    }, [
      el('span', { className: 'archive-date', textContent: formatDateShort(b.date) + (timeStr ? ' ' + timeStr : '') }),
      el('span', { className: 'archive-headline', textContent: b.headline || 'No headline' }),
      el('span', { className: 'archive-count', textContent: (b.item_count || 0) + ' items' })
    ]);
    list.appendChild(item);
  });

  if (totalPages > 1) {
    var btnNewer = el('button', { textContent: '\u2190 Newer', disabled: archivePage === 0, onclick: function() { archivePage--; renderArchivePage(); } });
    var info = el('span', { className: 'archive-page-info', textContent: (start + 1) + '\u2013' + Math.min(start + ARCHIVE_PAGE_SIZE, archiveBriefings.length) + ' of ' + archiveBriefings.length });
    var btnOlder = el('button', { textContent: 'Older \u2192', disabled: archivePage >= totalPages - 1, onclick: function() { archivePage++; renderArchivePage(); } });
    list.appendChild(el('div', { className: 'archive-pagination' }, [btnNewer, info, btnOlder]));
  }
}

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

// ============================================================
// 7. Settings Panel
// ============================================================

$('#btn-settings').addEventListener('click', function() {
  router.toggle('/settings');
});

$('#btn-close-settings').addEventListener('click', function() {
  router.navigate('/');
});

$$('.settings-tab').forEach(function(tab) {
  tab.addEventListener('click', function() { switchSettingsTab(tab.dataset.tab); });
});

function switchSettingsTab(tabName) {
  $$('.settings-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tabName); });
  var container = $('#settings-tab-content');
  container.replaceChildren();

  var loaders = {
    general: loadGeneralTab,
    sources: loadSourcesTab,
    categories: loadCategoriesTab,
    preferences: loadPreferencesTab,
    schedule: loadScheduleTab,
    ollama: loadOllamaTab,
    backup: loadBackupTab,
    log: loadLogTab,
  };
  if (loaders[tabName]) loaders[tabName](container);
}

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

// --- Tab: Sources ---
async function loadSourcesTab(container) {
  container.textContent = 'Loading sources...';
  container.prepend(el('span', { className: 'mini-spinner' }));
  try {
    var res = await fetch('/api/sources');
    var sourcesJson = await res.json();
    var sources = sourcesJson.sources;
    container.replaceChildren();

    var key = el('div', { className: 'source-key' }, [
      el('span', { className: 'source-key-item' }, [el('span', { className: 'source-status success' }), el('span', { textContent: 'OK' })]),
      el('span', { className: 'source-key-item' }, [el('span', { className: 'source-status error' }), el('span', { textContent: 'Error' })]),
      el('span', { className: 'source-key-item' }, [el('span', { className: 'source-status never' }), el('span', { textContent: 'Not fetched' })])
    ]);
    container.appendChild(key);

    var list = el('div', { className: 'source-list' });
    sources.forEach(function(s) {
      list.appendChild(renderSourceItem(s));
    });
    container.appendChild(list);
    container.appendChild(renderAddSourceForm());
  } catch (err) {
    container.replaceChildren(el('p', { className: 'status-msg error', textContent: 'Failed to load sources' }));
  }
}

function renderSourceItem(source) {
  var statusClass = source.last_fetch_status === 'ok' ? 'success' : source.last_fetch_status === 'never' ? 'never' : source.last_fetch_status ? 'error' : 'never';

  var toggleLabel = el('label', { className: 'toggle' });
  var toggleInput = el('input', { type: 'checkbox' });
  toggleInput.checked = !!source.enabled;
  toggleLabel.append(toggleInput, el('span', { className: 'toggle-slider' }));

  var nameEl = el('div', { className: 'source-name', textContent: source.name });
  var urlEl = el('div', { className: 'source-url', textContent: source.type === 'reddit' ? 'https://www.reddit.com/r/' + source.url : source.url });
  var typeBadge = el('span', { className: 'source-type-badge ' + source.type, textContent: source.type });

  var editBtn = el('button', {
    className: 'btn-icon-edit',
    textContent: '\u270e',
    title: 'Edit source'
  });

  var item = el('div', { className: 'source-item' + (source.enabled ? '' : ' disabled') }, [
    el('div', { className: 'source-status ' + statusClass, title: source.last_fetch_status || 'never' }),
    el('div', { className: 'source-info' }, [nameEl, urlEl]),
    typeBadge,
    el('div', { className: 'source-controls' }, [
      editBtn,
      toggleLabel,
      el('button', {
        className: 'btn btn-danger btn-sm',
        textContent: '\u00d7',
        title: 'Delete source',
        onclick: async function() {
          if (!confirm('Delete source "' + source.name + '"?')) return;
          await fetch('/api/sources/' + source.id, { method: 'DELETE' });
          item.remove();
        }
      })
    ])
  ]);

  editBtn.addEventListener('click', function() {
    if (item.classList.contains('editing')) {
      closeOpenEditForm();
      return;
    }
    closeOpenEditForm();
    var form = renderSourceEditForm(source, { nameEl: nameEl, urlEl: urlEl, typeBadge: typeBadge });
    item.appendChild(form);
    item.classList.add('editing');
    editBtn.textContent = '✕';
  });

  toggleInput.addEventListener('change', async function() {
    await fetch('/api/sources/' + source.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: toggleInput.checked ? 1 : 0 })
    });
    item.classList.toggle('disabled', !toggleInput.checked);
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
  fetch('/api/categories').then(function(r) { return r.json(); }).then(function(data) {
    if (!form.isConnected) return;
    (data.categories || []).forEach(function(c) {
      var opt = el('option', { value: c.slug, textContent: c.name });
      if (c.slug === source.default_category) opt.selected = true;
      defaultSelect.appendChild(opt);
    });
  }).catch(function() { /* dropdown stays at 'none' if fetch fails */ });

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
      refs.urlEl.textContent = source.type === 'reddit' ? 'https://www.reddit.com/r/' + url : url;
      refs.typeBadge.textContent = source.type;
      refs.typeBadge.className = 'source-type-badge ' + source.type;
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
    el('div', { className: 'form-row' }, [el('label', { textContent: 'Default category' }), defaultSelect]),
    errorEl,
    el('div', { className: 'form-actions' }, [cancelBtn, saveBtn])
  );

  setTimeout(function() { nameInput.focus(); nameInput.select(); }, 0);
  return form;
}

function renderAddSourceForm() {
  var form = el('div', { style: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' } });

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
      switchSettingsTab('sources');
    } else {
      var errData = await res.json().catch(function() { return {}; });
      showStatus(errData.error || 'Failed to add source', 'error');
    }
  }

  var addBtn = el('button', { className: 'btn btn-primary', textContent: 'Add Source', onclick: async function() {
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
      await createSource({ name: data.name, type: data.type, url: data.url, config: data.config });
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
    el('div', { className: 'form-label', textContent: 'Add New Source' }),
    el('div', { style: { marginBottom: '8px' } }, [pasteInput]),
    el('div', {}, [addBtn, advancedToggle]),
    statusEl,
    advancedWrap
  );
  return form;
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

  // Run history
  container.appendChild(el('div', { id: 'pipeline-history', style: { marginTop: '16px' } }));
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
  var status = $('#notif-status');
  if (!btn || !status) return;

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    btn.disabled = true;
    btn.textContent = 'Not supported';
    status.textContent = 'Push not available';
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
  } else {
    btn.textContent = 'Enable';
    btn.classList.remove('active');
    status.textContent = '';
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
    '/archive':  { viewId: 'archive-panel',      btnId: 'btn-archive',  title: 'Daily Briefing — Archive' },
    '/pipeline': { viewId: 'pipeline-panel',     btnId: 'btn-pipeline', title: 'Daily Briefing — Status' },
  };
  var currentPath = null;

  function normalize(path) {
    return ROUTES[path] ? path : '/';
  }

  function onEnter(path) {
    if (path === '/') {
      syncReaderFromLocation();
    } else if (path === '/settings') {
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
    } else if (path === '/') {
      resetReadingStage();
    }
  }

  function render(rawPath) {
    var path = normalize(rawPath);
    if (currentPath && currentPath !== path) onLeave(currentPath);

    var appRoot = document.getElementById('app');
    if (appRoot) appRoot.dataset.view = path === '/' ? 'reading' : path.slice(1);
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
    window.addEventListener('popstate', function() {
      render(location.pathname);
      syncReaderFromLocation();
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

// Load briefing
loadBriefing();

// Pipeline status indicator + global SSE
updatePipelineStatus();
connectGlobalSSE();

// Version footer + update check
initVersionFooter();

// Check for category suggestions
checkSuggestions();

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
