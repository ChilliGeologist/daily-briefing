'use strict';

const REPO = 'ChilliGeologist/daily-briefing';
const BRANCH = 'main';
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/package.json`;

let lastCheckResult = null;
let autoCheckInterval = null;

function getCurrentVersion() {
  const pkg = require('../package.json');
  const isDev = (process.env.DAILY_BRIEFING_VERSION || 'dev') === 'dev';
  return {
    version: pkg.version,
    isDev,
    display: isDev ? pkg.version + '-dev' : pkg.version,
  };
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

async function checkForUpdates() {
  try {
    const current = getCurrentVersion();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let remotePkg;
    try {
      const res = await fetch(RAW_URL, {
        headers: { 'User-Agent': 'DailyBriefing' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      remotePkg = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const remoteVersion = remotePkg.version;
    const cmp = compareVersions(current.version, remoteVersion);
    const available = cmp < 0;

    lastCheckResult = {
      available,
      current: current.display,
      latest: remoteVersion,
      checkedAt: new Date().toISOString(),
    };
    return lastCheckResult;
  } catch (err) {
    lastCheckResult = {
      available: false,
      current: getCurrentVersion().display,
      error: err.message,
      checkedAt: new Date().toISOString(),
    };
    return lastCheckResult;
  }
}

function getLastCheckResult() {
  return lastCheckResult;
}

function startAutoCheck(intervalHours, callback) {
  stopAutoCheck();
  if (!intervalHours || intervalHours <= 0) return;
  const ms = intervalHours * 60 * 60 * 1000;
  setTimeout(async () => {
    try {
      const status = await checkForUpdates();
      if (callback) callback(status);
    } catch (_) { /* swallow */ }
  }, 30000);
  autoCheckInterval = setInterval(async () => {
    try {
      const status = await checkForUpdates();
      if (callback) callback(status);
    } catch (_) { /* swallow */ }
  }, ms);
}

function stopAutoCheck() {
  if (autoCheckInterval) {
    clearInterval(autoCheckInterval);
    autoCheckInterval = null;
  }
}

module.exports = {
  getCurrentVersion,
  checkForUpdates,
  getLastCheckResult,
  startAutoCheck,
  stopAutoCheck,
};
