'use strict';

const router = require('express').Router();
const fs = require('node:fs/promises');
const path = require('node:path');
const { DEFAULT_INTERESTS, matchInterests } = require('../pipeline/writer/interests');
const { normaliseInterests } = require('../settings');

function sourceName(story) {
  const source = Array.isArray(story.sources) && story.sources[0];
  return String((source && (source.name || source.short_name)) || story.source_name || '');
}

function storyUrl(story) {
  const source = Array.isArray(story.sources) && story.sources[0];
  return String(story.canonical_url || story.article_url || story.url || (source && source.url) || '');
}

function editionStories(briefing) {
  const result = [];
  for (const section of (briefing && briefing.data && briefing.data.sections) || []) {
    result.push(...(section.items || []), ...(section.more || []), ...(section.briefs || []));
  }
  return result;
}

async function latestCandidates(candidatesDir) {
  let entries;
  try { entries = await fs.readdir(candidatesDir, { withFileTypes: true }); }
  catch (_) { return []; }
  const files = await Promise.all(entries.filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(async entry => {
    const filePath = path.join(candidatesDir, entry.name);
    return { filePath, stat: await fs.stat(filePath) };
  }));
  files.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs || right.filePath.localeCompare(left.filePath));
  if (!files[0]) return [];
  try {
    const parsed = JSON.parse(await fs.readFile(files[0].filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function tryMatches(stories, interest, origin, seen) {
  const matches = [];
  for (const story of stories) {
    const text = [story.title, story.headline, story.summary, story.description, story.article_content]
      .filter(Boolean).join('\n');
    const found = matchInterests(text, [interest]);
    if (found.length === 0) continue;
    const title = String(story.title || story.headline || 'Untitled story');
    const url = storyUrl(story);
    const key = url || title.toLocaleLowerCase('en-AU');
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({
      origin,
      id: String(story.id || ''),
      title,
      source: sourceName(story),
      url,
      terms: [...new Set(found.map(match => match.term))],
    });
  }
  return matches;
}

module.exports = function (db, settings, scheduler, options = {}) {
  router.get('/settings', (req, res) => {
    try {
      const raw = { ...settings.getAll() };
      delete raw.preferences_tone;
      delete raw.preferences_language;
      delete raw.preferences_boost_keywords;
      delete raw.preferences_penalty_keywords;
      res.json({
        ...raw,
        ...(typeof settings.getInterests === 'function' ? { interests: settings.getInterests() } : {}),
        starting_interests: DEFAULT_INTERESTS,
        ...(typeof settings.getAlertDailyCap === 'function' ? { alert_daily_cap: settings.getAlertDailyCap() } : {}),
        ...(typeof settings.getQuietHours === 'function' ? { quiet_hours: settings.getQuietHours() } : {}),
        ...(typeof settings.getLearningEnabled === 'function' ? { learning_enabled: settings.getLearningEnabled() } : {}),
        ...(typeof settings.getSections === 'function' ? { sections: settings.getSections() } : {}),
        ...(typeof settings.getSectionSize === 'function' ? { section_size: settings.getSectionSize() } : {}),
        ...(typeof settings.getTopSize === 'function' ? { top_size: settings.getTopSize() } : {}),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/interests/try', async (req, res) => {
    try {
      const interest = normaliseInterests([req.body])[0];
      const seen = new Set();
      const paper = editionStories(typeof db.getLatestBriefing === 'function' ? db.getLatestBriefing() : null);
      const candidates = await latestCandidates(options.candidatesDir || path.join(__dirname, '../../data/candidates'));
      res.json({ matches: [
        ...tryMatches(paper, interest, "today's paper", seen),
        ...tryMatches(candidates, interest, 'latest candidates', seen),
      ] });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  router.get('/settings/:key', (req, res) => {
    try {
      const value = db.getSetting(req.params.key);
      if (value === null) return res.status(404).json({ error: 'Setting not found' });
      res.json({ key: req.params.key, value });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/settings', (req, res) => {
    try {
      const updates = req.body;
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'Body must be a JSON object of key-value pairs' });
      }
      let scheduleChanged = false;
      for (const [key, value] of Object.entries(updates)) {
        settings.set(key, value);
        if (['schedule', 'timezone', 'alert_daily_cap', 'quiet_hours', 'learning_enabled'].includes(key)) scheduleChanged = true;
      }
      if (scheduleChanged) {
        scheduler.refreshSchedule(settings);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  router.put('/settings/:key', (req, res) => {
    try {
      const { value } = req.body;
      if (value === undefined) {
        return res.status(400).json({ error: 'value is required' });
      }
      settings.set(req.params.key, value);
      if (['schedule', 'timezone', 'alert_daily_cap', 'quiet_hours', 'learning_enabled'].includes(req.params.key)) {
        scheduler.refreshSchedule(settings);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  return router;
};

module.exports.latestCandidates = latestCandidates;
module.exports.tryMatches = tryMatches;
