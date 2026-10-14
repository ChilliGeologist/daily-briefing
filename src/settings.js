'use strict';

const { DEFAULT_INTERESTS } = require('./pipeline/writer/interests');

// Only this batch is appended to existing settings. Older defaults may have
// been deliberately deleted, so never union the entire default list on reads.
const FILLER_PATTERNS_ADDED_V1 = [
  'ask away', 'megathread',
  '/\\b(?:daily|weekly|monthly)\\s+(?:discussion|questions?)(?:\\s+(?:discussion|questions?))?\\s+threads?\\b/i',
  '/^\\s*(?:(?:hardware|quick)\\s+question|question|help|need\\s+advice)\\s*\\??\\s*$/i',
];
const FILLER_PATTERNS_ADDED_V2 = [
  '/\\(YC [WS]\\d{2}\\) is hiring/i',
  '/\\bis hiring\\b/i',
  '/^\\s*revealed:\\s*liquidator appointments for businesses in the .+ council area\\b/i',
];
const FILLER_PATTERNS_ADDED_V3 = [
  '/\\s[–—-]\\s(?:video|podcast|audio)\\s*$/i',
];
const FILLER_PATTERNS_ADDED_V4 = [
  '/\\bdiscussion\\s+threads?\\b/i',
];
const FILLER_PATTERNS_ADDED_V5 = [
  "/^\\s*(?:(?:tiktokers?|tiktok users?|redditors?)\\s+(?:says?|shares?|claims?|reveals?|explains?)\\b|redditor['’]s\\b)/i",
];
const DEFAULT_FILLER_PATTERNS = [
  'weather report for', 'magistrates court list', 'superquiz', 'best of cartoons',
  'crossword', 'horoscope', 'as it happened', 'quick quiz', 'word puzzle',
  'everybody appearing at', 'in case you missed it',
  ...FILLER_PATTERNS_ADDED_V1,
  ...FILLER_PATTERNS_ADDED_V2,
  ...FILLER_PATTERNS_ADDED_V3,
  ...FILLER_PATTERNS_ADDED_V4,
  ...FILLER_PATTERNS_ADDED_V5,
];
const DEFAULT_PAYWALLED_HOSTS = [
  'themercury.com.au', 'examiner.com.au', 'theadvocate.com.au', 'theaustralian.com.au',
];

function createSettings(db) {
  // Run once at app startup so the settings UI and pipeline see the same list.
  // Write the revision last: if startup is interrupted, appending is idempotent.
  const fillerRevision = Number(db.getSetting('filler_patterns_revision'));
  if (fillerRevision < 5) {
    const stored = db.getSetting('filler_patterns');
    const patterns = stored === null ? [...DEFAULT_FILLER_PATTERNS]
      : [
        ...stored,
        ...(fillerRevision < 1 ? FILLER_PATTERNS_ADDED_V1 : []),
        ...(fillerRevision < 2 ? FILLER_PATTERNS_ADDED_V2 : []),
        ...(fillerRevision < 3 ? FILLER_PATTERNS_ADDED_V3 : []),
        ...(fillerRevision < 4 ? FILLER_PATTERNS_ADDED_V4 : []),
        ...FILLER_PATTERNS_ADDED_V5,
      ].filter((pattern, index, all) => all.indexOf(pattern) === index);
    db.setSetting('filler_patterns', patterns);
    db.setSetting('filler_patterns_revision', 5);
  }
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

    getMaxCandidates() {
      const val = db.getSetting('max_candidates');
      return val !== null ? Number(val) : 120;
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
