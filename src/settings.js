'use strict';

const { DEFAULT_INTERESTS } = require('./pipeline/writer/interests');
const { SECTIONS } = require('./pipeline/writer/sections');

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
const FILLER_PATTERNS_ADDED_V6 = [
  "/^\\s*redditors?(?:['’]s)?\\b/i",
];
const FILLER_PATTERNS_ADDED_V7 = [
  '/^(?!\\s*(?:number|count|supply|stock|shortage|volume|share|prices?|sales?)\\s+of\\b)\\s*.{0,80}\\b(?:home|house|farmhouse|residence|property|apartment|unit)s?\\b.{0,80}\\b(?:for sale|listed for sale|on the market)\\b/i',
  '/^\\s*embrace\\s+this\\s+.+\\s+life\\b/i',
];
const FILLER_PATTERNS_ADDED_V8 = [
  '/\\b(?:actor|actress|singer|rapper|musician|comedian|star|celebrity|entertainer)s?\\b.{0,100}\\b(?:gives? birth|welcomes? (?:a |their )?baby|pregnan(?:t|cy)|baby announcement|engaged|engagement|wedding|marries|married|divorce[ds]?)\\b|\\b(?:gives? birth|welcomes? (?:a |their )?baby|pregnan(?:t|cy)|baby announcement|engaged|engagement|wedding|marries|married|divorce[ds]?)\\b.{0,100}\\b(?:actor|actress|singer|rapper|musician|comedian|star|celebrity|entertainer)s?\\b/i',
  '/\\bannounces? next [‘\'“"]?project[’\'”"]?\\b.{0,80}\\b(?:family|baby|pregnan)/i',
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
  ...FILLER_PATTERNS_ADDED_V6,
  ...FILLER_PATTERNS_ADDED_V7,
  ...FILLER_PATTERNS_ADDED_V8,
];
const DEFAULT_PAYWALLED_HOSTS = [
  'themercury.com.au', 'examiner.com.au', 'theadvocate.com.au', 'theaustralian.com.au',
];

const DEFAULT_QUIET_HOURS = Object.freeze(['22:00', '06:00']);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function settingError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normaliseInterests(value) {
  if (!Array.isArray(value)) throw settingError('Interests must be a list');
  return value.map((entry, index) => {
    const number = index + 1;
    const label = String(entry && entry.label || '').trim();
    if (!label) throw settingError(`Interest ${number} needs a name`);
    const terms = [];
    const seen = new Set();
    for (const raw of Array.isArray(entry.terms) ? entry.terms : []) {
      const term = String(raw || '').trim();
      const key = term.toLocaleLowerCase('en-AU');
      if (term && !seen.has(key)) {
        seen.add(key);
        terms.push(term);
      }
    }
    if (terms.length === 0) {
      throw settingError(`Interest ${number} needs at least one matching word or phrase`);
    }
    const kind = ['place', 'topic', 'product'].includes(entry.kind) ? entry.kind : 'topic';
    const weight = Number(entry.weight);
    if (![1, 2, 3].includes(weight)) throw settingError(`Interest ${number} has an invalid importance`);
    return {
      label,
      kind,
      terms,
      weight,
      urgent: Boolean(entry.urgent),
      requires_place: Boolean(entry.requires_place),
    };
  });
}

function normaliseQuietHours(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(time => TIME_PATTERN.test(String(time)))) {
    throw settingError('Quiet hours need a start and finish time');
  }
  return value.map(String);
}

function normaliseSections(value) {
  const known = new Set(SECTIONS.map(section => section.id));
  const result = [];
  const seen = new Set();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const id = String(entry && entry.id || '');
      if (!known.has(id) || seen.has(id)) continue;
      seen.add(id);
      result.push({ id, hidden: Boolean(entry.hidden) });
    }
  }
  for (const section of SECTIONS) {
    if (!seen.has(section.id)) result.push({ id: section.id, hidden: false });
  }
  return result;
}

function createSettings(db) {
  // Run once at app startup so the settings UI and pipeline see the same list.
  // Write the revision last: if startup is interrupted, appending is idempotent.
  const fillerRevision = Number(db.getSetting('filler_patterns_revision'));
  if (fillerRevision < 8) {
    const stored = db.getSetting('filler_patterns');
    const patterns = stored === null ? [...DEFAULT_FILLER_PATTERNS]
      : [
        ...stored,
        ...(fillerRevision < 1 ? FILLER_PATTERNS_ADDED_V1 : []),
        ...(fillerRevision < 2 ? FILLER_PATTERNS_ADDED_V2 : []),
        ...(fillerRevision < 3 ? FILLER_PATTERNS_ADDED_V3 : []),
        ...(fillerRevision < 4 ? FILLER_PATTERNS_ADDED_V4 : []),
        ...(fillerRevision < 5 ? FILLER_PATTERNS_ADDED_V5 : []),
        ...(fillerRevision < 6 ? FILLER_PATTERNS_ADDED_V6 : []),
        ...(fillerRevision < 7 ? FILLER_PATTERNS_ADDED_V7 : []),
        ...FILLER_PATTERNS_ADDED_V8,
      ].filter((pattern, index, all) => all.indexOf(pattern) === index);
    db.setSetting('filler_patterns', patterns);
    db.setSetting('filler_patterns_revision', 8);
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

    getAlertDailyCap() {
      const val = db.getSetting('alert_daily_cap');
      return val !== null ? Number(val) : 3;
    },

    getQuietHours() {
      const val = db.getSetting('quiet_hours');
      return val !== null ? normaliseQuietHours(val) : [...DEFAULT_QUIET_HOURS];
    },

    getLearningEnabled() {
      const val = db.getSetting('learning_enabled');
      return val !== null ? Boolean(val) : true;
    },

    getSections() {
      return normaliseSections(db.getSetting('sections'));
    },

    getWriterOllamaModel() {
      return db.getSetting('writer_ollama_model') || this.getOllamaModel();
    },

    getWriterNumThread() {
      const val = db.getSetting('writer_num_thread');
      return val !== null ? Number(val) : 4;
    },

    getToldOllamaModel() {
      return db.getSetting('told_ollama_model') || this.getWriterOllamaModel();
    },

    getToldNumThread() {
      const val = db.getSetting('told_num_thread');
      return val !== null ? Number(val) : 4;
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
      if (String(key).startsWith('preferences_')) {
        throw settingError('Preferences are no longer used; edit Your interests instead');
      }
      if (key === 'interests') value = normaliseInterests(value);
      if (key === 'quiet_hours') value = normaliseQuietHours(value);
      if (key === 'sections') value = normaliseSections(value);
      if (key === 'alert_daily_cap') {
        value = Number(value);
        if (!Number.isInteger(value) || value < 0 || value > 100) {
          throw settingError('The daily alert limit must be a whole number from 0 to 100');
        }
      }
      if (key === 'learning_enabled') value = Boolean(value);
      db.setSetting(key, value);
    },

    getAll() {
      return db.getAllSettings();
    },
  };
}

module.exports = {
  DEFAULT_QUIET_HOURS,
  createSettings,
  normaliseInterests,
  normaliseQuietHours,
  normaliseSections,
};
