'use strict';

const REPO = 'ChilliGeologist/daily-briefing';
const BRANCH = 'main';
const GITHUB_API = `https://api.github.com/repos/${REPO}`;

let autoCheckInterval = null;
let lastCheckResult = null;

function getCurrentVersion() {
  return {
    hash: (process.env.DAILY_BRIEFING_VERSION || 'dev').substring(0, 7),
    full_hash: process.env.DAILY_BRIEFING_VERSION || 'dev',
    build_date: process.env.DAILY_BRIEFING_BUILD_DATE || 'unknown',
  };
}

async function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'DailyBriefing' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function checkForUpdates() {
  try {
    const current = getCurrentVersion();

    if (current.full_hash === 'dev') {
      lastCheckResult = { available: false, current, reason: 'dev build' };
      return lastCheckResult;
    }

    // Get latest commits on main
    const commits = await fetchJSON(`${GITHUB_API}/commits?sha=${BRANCH}&per_page=10`);

    if (!commits.length) {
      lastCheckResult = { available: false, current };
      return lastCheckResult;
    }

    const latestHash = commits[0].sha;
    const available = !latestHash.startsWith(current.full_hash) &&
                      !current.full_hash.startsWith(latestHash);

    // Build changelog of commits ahead of current version
    const changelog = [];
    if (available) {
      for (const c of commits) {
        if (c.sha.startsWith(current.full_hash) || current.full_hash.startsWith(c.sha)) break;
        changelog.push({
          hash: c.sha.substring(0, 7),
          message: (c.commit.message || '').split('\n')[0],
          date: c.commit.committer.date,
        });
      }
    }

    const latest = {
      hash: latestHash.substring(0, 7),
      full_hash: latestHash,
      message: (commits[0].commit.message || '').split('\n')[0],
      date: commits[0].commit.committer.date,
    };

    lastCheckResult = { available, current, latest, changelog };
    return lastCheckResult;
  } catch (err) {
    lastCheckResult = { available: false, error: err.message, current: getCurrentVersion() };
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
  // Initial check after 30 seconds
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
