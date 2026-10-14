'use strict';

const DEFAULT_FILLER_PATTERNS = [
  'weather report for', 'magistrates court list', 'superquiz', 'best of cartoons',
  'crossword', 'horoscope', 'as it happened', 'quick quiz', 'word puzzle',
];
const DEFAULT_PAYWALLED_HOSTS = [
  'themercury.com.au', 'examiner.com.au', 'theadvocate.com.au', 'theaustralian.com.au',
];

function createSettings(db) {
  return {
    getAppTitle() {
      return db.getSetting('app_title') || 'Daily Briefing';
    },

    getOllamaUrl() {
      return db.getSetting('ollama_url') || 'http://ollama:11434';
    },

    getOllamaModel() {
      return db.getSetting('ollama_model') || 'gemma4:26b';
    },

    getTimezone() {
      return db.getSetting('timezone') || 'UTC';
    },

    getSchedule() {
      return db.getSetting('schedule') || ['06:00'];
    },

    getPreferences() {
      return {
        tone: db.getSetting('preferences_tone') || 'Concise, no fluff',
        language: db.getSetting('preferences_language') || 'English',
        boost_keywords: db.getSetting('preferences_boost_keywords') || [],
        penalty_keywords: db.getSetting('preferences_penalty_keywords') || [],
      };
    },

    getScoreThreshold() {
      const val = db.getSetting('score_threshold');
      return val !== null ? Number(val) : 20;
    },

    getMaxCuratedItems() {
      const val = db.getSetting('max_curated_items');
      return val !== null ? Number(val) : 60;
    },

    getFilterMaxAgeHours() {
      const val = db.getSetting('filter_max_age_hours');
      return val !== null ? Number(val) : 36;
    },

    getFillerPatterns() {
      const val = db.getSetting('filler_patterns');
      return val !== null ? val : DEFAULT_FILLER_PATTERNS;
    },

    getPaywalledHosts() {
      const val = db.getSetting('paywalled_hosts');
      return val !== null ? val : DEFAULT_PAYWALLED_HOSTS;
    },

    getMaxSameStoryChecks() {
      const val = db.getSetting('max_same_story_checks');
      return val !== null ? Number(val) : 40;
    },

    getLogDisplayLevel() {
      return db.getSetting('log_display_level') || 'INFO';
    },

    getUpdateCheckInterval() {
      const val = db.getSetting('update_check_interval');
      return val !== null ? Number(val) : 24;
    },

    getLogRetentionDays() {
      const val = db.getSetting('log_retention_days');
      return val !== null ? Number(val) : 30;
    },

    set(key, value) {
      db.setSetting(key, value);
    },

    getAll() {
      return db.getAllSettings();
    },
  };
}

module.exports = { createSettings };
