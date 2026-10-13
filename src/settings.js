'use strict';

const { DEFAULT_INTERESTS } = require('./pipeline/writer/interests');

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

    getInterests() {
      const val = db.getSetting('interests');
      return val !== null ? val : DEFAULT_INTERESTS;
    },

    getWriter() {
      return db.getSetting('writer') || 'ollama';
    },

    getAnthropicApiKey() {
      return db.getSetting('anthropic_api_key') || null;
    },

    getAnthropicWriteModel() {
      return db.getSetting('anthropic_write_model') || 'claude-haiku-4-5';
    },

    getAnthropicEditModel() {
      return db.getSetting('anthropic_edit_model') || 'claude-sonnet-5-5';
    },

    getWriterOllamaModel() {
      return db.getSetting('writer_ollama_model') || this.getOllamaModel();
    },

    getOllamaNumCtx() {
      const val = db.getSetting('ollama_num_ctx');
      return val !== null ? Number(val) : 8192;
    },

    getWriterArticleChars() {
      const val = db.getSetting('writer_article_chars');
      return val !== null ? Number(val) : 6000;
    },

    getSectionSize() {
      const val = db.getSetting('section_size');
      return val !== null ? Number(val) : 5;
    },

    getTopSize() {
      return db.getSetting('top_size') || { min: 5, max: 7 };
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
