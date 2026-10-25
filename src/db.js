'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const {
  backfillStorySearch,
  ensureStorySearch,
  indexBriefingRow,
  searchStories,
  storyEntries,
} = require('./story-search');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS briefings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    headline TEXT,
    data TEXT,
    item_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    config TEXT DEFAULT '{}',
    default_category TEXT,
    enabled INTEGER DEFAULT 1,
    priority REAL DEFAULT 1.0,
    last_fetch_status TEXT DEFAULT 'never',
    last_fetch_at TEXT,
    last_fetch_error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS run_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT UNIQUE NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    finished_at TEXT,
    status TEXT DEFAULT 'running',
    trigger TEXT,
    items_collected INTEGER DEFAULT 0,
    items_scored INTEGER DEFAULT 0,
    items_curated INTEGER DEFAULT 0,
    error_summary TEXT
  );

  CREATE TABLE IF NOT EXISTS source_run_results (
    run_id TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (run_id, source_id),
    FOREIGN KEY (run_id) REFERENCES run_log(run_id),
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS log_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    timestamp TEXT NOT NULL,
    level TEXT NOT NULL,
    component TEXT,
    message TEXT,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS category_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    suggestion TEXT NOT NULL,
    item_count INTEGER DEFAULT 0,
    dismissed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE NOT NULL,
    keys TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alert_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_date TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    sources_read TEXT NOT NULL DEFAULT '[]',
    items_seen INTEGER NOT NULL DEFAULT 0,
    candidates_count INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id INTEGER NOT NULL,
    local_date TEXT NOT NULL,
    headline TEXT NOT NULL,
    kicker TEXT NOT NULL,
    reason TEXT,
    summary TEXT,
    original_url TEXT,
    canonical_url TEXT,
    title_hash TEXT NOT NULL,
    source_name TEXT,
    source_kind TEXT,
    candidate_kind TEXT NOT NULL,
    model_verdict TEXT NOT NULL DEFAULT 'not_asked',
    sent INTEGER NOT NULL DEFAULT 0,
    not_sent_reason TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT,
    FOREIGN KEY (check_id) REFERENCES alert_checks(id)
  );

  CREATE TABLE IF NOT EXISTS watch_seen (
    canonical_url TEXT NOT NULL,
    title_hash TEXT NOT NULL,
    seen_at TEXT NOT NULL,
    PRIMARY KEY (canonical_url, title_hash)
  );

  CREATE TABLE IF NOT EXISTS story_events (
    briefing_id INTEGER NOT NULL,
    story_key TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('seen', 'opened', 'read_full')),
    at TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT '',
    kicker TEXT NOT NULL DEFAULT '',
    outlets TEXT NOT NULL DEFAULT '[]',
    interest_labels TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (briefing_id, story_key, kind),
    FOREIGN KEY (briefing_id) REFERENCES briefings(id)
  );

  CREATE TABLE IF NOT EXISTS learned_nudges (
    feature_type TEXT NOT NULL CHECK (feature_type IN ('kicker', 'outlet', 'section')),
    feature_value TEXT NOT NULL,
    display_value TEXT NOT NULL,
    nudge REAL NOT NULL,
    seen_count INTEGER NOT NULL,
    weighted_opens REAL NOT NULL,
    open_rate REAL NOT NULL,
    shrunk_rate REAL NOT NULL,
    overall_rate REAL NOT NULL,
    computed_at TEXT NOT NULL,
    PRIMARY KEY (feature_type, feature_value)
  );

  CREATE INDEX IF NOT EXISTS idx_briefings_date ON briefings(date);
  CREATE INDEX IF NOT EXISTS idx_log_entries_run_id ON log_entries(run_id);
  CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp);
  CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled);
  CREATE INDEX IF NOT EXISTS idx_source_run_results_source ON source_run_results(source_id, fetched_at DESC);
  CREATE INDEX IF NOT EXISTS idx_alert_checks_local_date ON alert_checks(local_date, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_alerts_check_id ON alerts(check_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_local_sent ON alerts(local_date, sent);
  CREATE INDEX IF NOT EXISTS idx_watch_seen_at ON watch_seen(seen_at);
  CREATE INDEX IF NOT EXISTS idx_story_events_at ON story_events(at);
`;

const SYSTEM_CATEGORY_SLUG = 'other';

const DEFAULT_CATEGORIES = [
  { slug: SYSTEM_CATEGORY_SLUG, name: 'Other', description: 'Items that do not fit any other category', icon: 'archive', sort_order: 9999 },
];

const DEFAULT_SETTINGS = {
  app_title: 'Daily Briefing',
  ollama_url: 'http://ollama:11434',
  ollama_model: 'gemma4:26b',
  timezone: 'UTC',
  schedule: ['06:00'],
  preferences_tone: 'Concise, no fluff',
  preferences_language: 'English',
  preferences_boost_keywords: [],
  preferences_penalty_keywords: [],
  log_display_level: 'INFO',
  score_threshold: 20,
  max_curated_items: 60,
  update_check_interval: 24,
  log_retention_days: 30,
};

function migrateDropBriefingDateUnique(sqlite) {
  // Check if the UNIQUE constraint still exists on briefings.date
  const tableInfo = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='briefings'").get();
  if (!tableInfo || !tableInfo.sql.includes('UNIQUE')) return;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS briefings_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      headline TEXT,
      data TEXT,
      item_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO briefings_new (id, date, headline, data, item_count, created_at)
      SELECT id, date, headline, data, item_count, created_at FROM briefings;
    DROP TABLE briefings;
    ALTER TABLE briefings_new RENAME TO briefings;
    CREATE INDEX IF NOT EXISTS idx_briefings_date ON briefings(date);
  `);
}

function initDB(dbPath) {
  const fs = require('fs');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(SCHEMA);

  // Migration: drop UNIQUE constraint on briefings.date (allow multiple per day)
  migrateDropBriefingDateUnique(sqlite);

  // Search is a derived sidecar. The briefing JSON remains the source of
  // truth, so a missing index can always be recreated at startup.
  ensureStorySearch(sqlite);

  // Seed defaults
  seedCategories(sqlite);
  seedSettings(sqlite);

  // Prepare commonly used statements
  const stmts = prepareStatements(sqlite);
  const insertBriefingWithSearch = sqlite.transaction((date, briefingData, dataStr, itemCount, headline) => {
    const result = stmts.insertBriefing.run(date, headline, dataStr, itemCount);
    indexBriefingRow(sqlite, {
      id: Number(result.lastInsertRowid),
      date,
      data: briefingData,
    });
    return Number(result.lastInsertRowid);
  });
  const storySearchBackfill = backfillStorySearch(sqlite);

  const db = {
    raw: sqlite,

    // --- Briefings ---
    insertBriefing(date, briefingData) {
      const dataStr = JSON.stringify(briefingData);
      let itemCount = 0;
      if (briefingData && Array.isArray(briefingData.sections)) {
        for (const section of briefingData.sections) {
          if (Array.isArray(section.items)) {
            itemCount += section.items.length;
          }
          if (Array.isArray(section.more)) {
            itemCount += section.more.length;
          }
        }
      }
      const headline = briefingData.headline || null;
      return insertBriefingWithSearch(date, briefingData, dataStr, itemCount, headline);
    },

    getBriefingById(id) {
      const row = stmts.getBriefingById.get(id);
      if (!row) return null;
      return { ...row, data: JSON.parse(row.data) };
    },

    getLatestBriefing() {
      const row = stmts.getLatestBriefing.get();
      if (!row) return null;
      return { ...row, data: JSON.parse(row.data) };
    },

    listBriefings() {
      return stmts.listBriefings.all().map(briefingListItem);
    },

    searchStories(query, limit, before) {
      return searchStories(sqlite, query, limit, before);
    },

    backfillStorySearch() {
      return backfillStorySearch(sqlite);
    },

    storySearchBackfill,

    // --- Sources ---
    getSources() {
      return sqlite.prepare('SELECT * FROM sources ORDER BY priority DESC, name ASC').all()
        .map(r => ({ ...r, config: JSON.parse(r.config || '{}') }));
    },

    getEnabledSources() {
      return sqlite.prepare('SELECT * FROM sources WHERE enabled = 1 ORDER BY priority DESC, name ASC').all()
        .map(r => ({ ...r, config: JSON.parse(r.config || '{}') }));
    },

    addSource(fields) {
      const { name, type, url, config, default_category, enabled, priority } = fields;
      const stmt = sqlite.prepare(
        `INSERT INTO sources (name, type, url, config, default_category, enabled, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      const result = stmt.run(
        name, type, url,
        JSON.stringify(config || {}),
        default_category || null,
        enabled !== undefined ? (enabled ? 1 : 0) : 1,
        priority || 1.0
      );
      return result.lastInsertRowid;
    },

    updateSource(id, fields) {
      const sets = [];
      const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'config') {
          sets.push('config = ?');
          vals.push(JSON.stringify(v));
        } else if (k === 'enabled') {
          sets.push('enabled = ?');
          vals.push(v ? 1 : 0);
        } else {
          sets.push(`${k} = ?`);
          vals.push(v);
        }
      }
      if (sets.length === 0) return;
      vals.push(id);
      sqlite.prepare(`UPDATE sources SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    },

    deleteSource(id) {
      sqlite.prepare('DELETE FROM sources WHERE id = ?').run(id);
    },

    updateSourceFetchStatus(id, status, error) {
      sqlite.prepare(
        `UPDATE sources SET last_fetch_status = ?, last_fetch_at = datetime('now'), last_fetch_error = ? WHERE id = ?`
      ).run(status, error || null, id);
    },

    addSourceRunResult(fields) {
      sqlite.prepare(`
        INSERT INTO source_run_results (run_id, source_id, status, item_count, error, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, source_id) DO UPDATE SET
          status = excluded.status,
          item_count = excluded.item_count,
          error = excluded.error,
          fetched_at = excluded.fetched_at
      `).run(
        fields.run_id, fields.source_id, fields.status, Number(fields.item_count) || 0,
        fields.error || null, fields.fetched_at
      );
    },

    getLatestSourceRunResults() {
      const rows = sqlite.prepare(`
        SELECT result.*, run.started_at AS run_started_at
        FROM source_run_results result
        JOIN run_log run ON run.run_id = result.run_id
        WHERE result.rowid = (
          SELECT latest.rowid FROM source_run_results latest
          JOIN run_log latest_run ON latest_run.run_id = latest.run_id
          WHERE latest.source_id = result.source_id
          ORDER BY latest_run.started_at DESC, latest.fetched_at DESC, latest.rowid DESC
          LIMIT 1
        )
        ORDER BY result.source_id
      `).all();
      return Object.fromEntries(rows.map(row => [row.source_id, row]));
    },

    // --- Categories ---
    getCategories() {
      return sqlite.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
    },

    addCategory(fields) {
      const { slug, name, description, icon, sort_order } = fields;
      const result = sqlite.prepare(
        'INSERT INTO categories (slug, name, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
      ).run(slug, name, description || null, icon || null, sort_order || 0);
      return result.lastInsertRowid;
    },

    updateCategory(id, fields) {
      const sets = [];
      const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
      if (sets.length === 0) return;
      vals.push(id);
      sqlite.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    },

    deleteCategory(id) {
      sqlite.prepare('DELETE FROM categories WHERE id = ?').run(id);
    },

    reorderCategories(orderedIds) {
      const stmt = sqlite.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
      const tx = sqlite.transaction((ids) => {
        ids.forEach((id, i) => stmt.run(i + 1, id));
      });
      tx(orderedIds);
    },

    // --- Settings ---
    getSetting(key) {
      const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      if (!row) return null;
      try { return JSON.parse(row.value); } catch { return row.value; }
    },

    setSetting(key, value) {
      sqlite.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).run(key, JSON.stringify(value));
    },

    getAllSettings() {
      const rows = sqlite.prepare('SELECT key, value FROM settings').all();
      const result = {};
      for (const row of rows) {
        try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
      }
      return result;
    },

    // --- Run Log ---
    cleanupOrphanedRuns() {
      sqlite.prepare(
        "UPDATE run_log SET status = 'error', error_summary = 'Interrupted by server restart', finished_at = datetime('now') WHERE status = 'running'"
      ).run();
    },

    createRun(runId, trigger) {
      sqlite.prepare(
        'INSERT INTO run_log (run_id, trigger) VALUES (?, ?)'
      ).run(runId, trigger || 'manual');
    },

    updateRun(runId, fields) {
      const sets = [];
      const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
      if (sets.length === 0) return;
      vals.push(runId);
      sqlite.prepare(`UPDATE run_log SET ${sets.join(', ')} WHERE run_id = ?`).run(...vals);
    },

    getRun(runId) {
      return sqlite.prepare('SELECT * FROM run_log WHERE run_id = ?').get(runId) || null;
    },

    listRuns(limit = 50) {
      return sqlite.prepare('SELECT * FROM run_log ORDER BY started_at DESC LIMIT ?').all(limit);
    },

    getRunLog(runId, filters = {}) {
      let sql = 'SELECT * FROM log_entries WHERE run_id = ?';
      const params = [runId];
      if (filters.level) {
        sql += ' AND level = ?';
        params.push(filters.level);
      }
      if (filters.component) {
        sql += ' AND component = ?';
        params.push(filters.component);
      }
      sql += ' ORDER BY timestamp ASC';
      return sqlite.prepare(sql).all(...params);
    },

    // --- Log Entries ---
    insertLogEntry({ run_id, timestamp, level, component, message, metadata }) {
      stmts.insertLogEntry.run(
        run_id || null, timestamp, level, component || null, message || null, metadata || null
      );
    },

    getLogEntries(filters = {}) {
      let sql = 'SELECT * FROM log_entries WHERE 1=1';
      const params = [];
      if (filters.run_id) { sql += ' AND run_id = ?'; params.push(filters.run_id); }
      if (filters.level) { sql += ' AND level = ?'; params.push(filters.level); }
      if (filters.component) { sql += ' AND component = ?'; params.push(filters.component); }
      if (filters.since) { sql += ' AND timestamp >= ?'; params.push(filters.since); }
      sql += ' ORDER BY timestamp DESC';
      if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }
      return sqlite.prepare(sql).all(...params);
    },

    pruneLogEntries(olderThanDays) {
      sqlite.prepare(
        `DELETE FROM log_entries WHERE timestamp < datetime('now', '-' || ? || ' days')`
      ).run(olderThanDays);
    },

    // --- Category Suggestions ---
    addSuggestion(runId, suggestion, itemCount) {
      sqlite.prepare(
        'INSERT INTO category_suggestions (run_id, suggestion, item_count) VALUES (?, ?, ?)'
      ).run(runId, suggestion, itemCount || 0);
    },

    getActiveSuggestions() {
      return sqlite.prepare(
        'SELECT * FROM category_suggestions WHERE dismissed = 0 ORDER BY created_at DESC'
      ).all();
    },

    dismissSuggestion(id) {
      sqlite.prepare('UPDATE category_suggestions SET dismissed = 1 WHERE id = ?').run(id);
    },

    dismissAllSuggestions() {
      sqlite.prepare('UPDATE category_suggestions SET dismissed = 1 WHERE dismissed = 0').run();
    },

    // --- Push Subscriptions ---
    addPushSubscription(endpoint, keys) {
      sqlite.prepare(
        'INSERT INTO push_subscriptions (endpoint, keys) VALUES (?, ?) ON CONFLICT(endpoint) DO UPDATE SET keys = excluded.keys'
      ).run(endpoint, JSON.stringify(keys));
    },

    removePushSubscription(endpoint) {
      sqlite.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
    },

    getPushSubscriptions() {
      return sqlite.prepare('SELECT * FROM push_subscriptions').all()
        .map(r => ({ ...r, keys: JSON.parse(r.keys || '{}') }));
    },

    // --- Urgent alert watch ---
    createAlertCheck({ local_date, started_at, status = 'running' }) {
      const result = sqlite.prepare(
        'INSERT INTO alert_checks (local_date, started_at, status) VALUES (?, ?, ?)'
      ).run(local_date, started_at, status);
      return Number(result.lastInsertRowid);
    },

    finishAlertCheck(id, fields) {
      const allowed = new Set([
        'finished_at', 'status', 'sources_read', 'items_seen', 'candidates_count', 'error',
      ]);
      const sets = [];
      const values = [];
      for (const [key, raw] of Object.entries(fields || {})) {
        if (!allowed.has(key)) continue;
        sets.push(`${key} = ?`);
        values.push(key === 'sources_read' ? JSON.stringify(raw || []) : raw);
      }
      if (sets.length === 0) return;
      values.push(id);
      sqlite.prepare(`UPDATE alert_checks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    },

    addAlert(fields) {
      const result = sqlite.prepare(`
        INSERT INTO alerts (
          check_id, local_date, headline, kicker, reason, summary,
          original_url, canonical_url, title_hash, source_name, source_kind,
          candidate_kind, model_verdict, sent, not_sent_reason, created_at, sent_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fields.check_id, fields.local_date, fields.headline, fields.kicker,
        fields.reason || null, fields.summary || null, fields.original_url || null,
        fields.canonical_url || null, fields.title_hash, fields.source_name || null,
        fields.source_kind || null, fields.candidate_kind,
        fields.model_verdict || 'not_asked', fields.sent ? 1 : 0,
        fields.not_sent_reason || null, fields.created_at, fields.sent_at || null
      );
      return Number(result.lastInsertRowid);
    },

    updateAlert(id, fields) {
      const allowed = new Set(['reason', 'model_verdict', 'sent', 'not_sent_reason', 'sent_at', 'summary']);
      const sets = [];
      const values = [];
      for (const [key, raw] of Object.entries(fields || {})) {
        if (!allowed.has(key)) continue;
        sets.push(`${key} = ?`);
        values.push(key === 'sent' ? (raw ? 1 : 0) : raw);
      }
      if (sets.length === 0) return;
      values.push(id);
      sqlite.prepare(`UPDATE alerts SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    },

    getAlertById(id) {
      return sqlite.prepare('SELECT * FROM alerts WHERE id = ?').get(id) || null;
    },

    getSentAlerts(localDate) {
      return sqlite.prepare(
        'SELECT * FROM alerts WHERE local_date = ? AND sent = 1 ORDER BY sent_at ASC, id ASC'
      ).all(localDate);
    },

    getRecentSentAlerts(since) {
      return sqlite.prepare(
        'SELECT * FROM alerts WHERE sent = 1 AND sent_at >= ? ORDER BY sent_at DESC, id DESC'
      ).all(since);
    },

    countSentAlerts(localDate) {
      return sqlite.prepare(
        'SELECT COUNT(*) AS count FROM alerts WHERE local_date = ? AND sent = 1'
      ).get(localDate).count;
    },

    listAlertChecks(localDate) {
      const checks = sqlite.prepare(
        'SELECT * FROM alert_checks WHERE local_date = ? ORDER BY started_at DESC, id DESC'
      ).all(localDate);
      const alerts = sqlite.prepare(
        'SELECT * FROM alerts WHERE check_id = ? ORDER BY id ASC'
      );
      return checks.map(check => ({
        ...check,
        sources_read: parseStoredArray(check.sources_read),
        candidates: alerts.all(check.id),
      }));
    },

    hasWatchSeen(canonicalUrl, hash) {
      return Boolean(sqlite.prepare(
        'SELECT 1 FROM watch_seen WHERE canonical_url = ? AND title_hash = ?'
      ).get(canonicalUrl, hash));
    },

    markWatchSeen(canonicalUrl, hash, seenAt) {
      sqlite.prepare(`
        INSERT INTO watch_seen (canonical_url, title_hash, seen_at) VALUES (?, ?, ?)
        ON CONFLICT(canonical_url, title_hash) DO UPDATE SET seen_at = excluded.seen_at
      `).run(canonicalUrl, hash, seenAt);
    },

    pruneWatchSeen(before) {
      return sqlite.prepare('DELETE FROM watch_seen WHERE seen_at < ?').run(before).changes;
    },

    // --- Reading events and learned ordering ---
    insertStoryEvents(rows) {
      const insert = sqlite.prepare(`
        INSERT OR IGNORE INTO story_events
          (briefing_id, story_key, kind, at, section, kicker, outlets, interest_labels)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const transaction = sqlite.transaction(values => values.reduce((count, row) => count + insert.run(
        row.briefing_id, row.story_key, row.kind, row.at, row.section, row.kicker,
        row.outlets, row.interest_labels
      ).changes, 0));
      return transaction(rows);
    },

    getLearningStories(since) {
      return sqlite.prepare(`
        SELECT briefing_id, story_key,
          MAX(section) AS section,
          MAX(kicker) AS kicker,
          MAX(outlets) AS outlets,
          MAX(interest_labels) AS interest_labels,
          MAX(CASE WHEN kind = 'seen' THEN 1 ELSE 0 END) AS seen,
          MAX(CASE WHEN kind = 'opened' THEN 1 ELSE 0 END) AS opened,
          MAX(CASE WHEN kind = 'read_full' THEN 1 ELSE 0 END) AS read_full
        FROM story_events
        WHERE at >= ?
        GROUP BY briefing_id, story_key
        ORDER BY briefing_id, story_key
      `).all(since);
    },

    getLearnedNudges() {
      return sqlite.prepare(`
        SELECT feature_type, feature_value, display_value, nudge, seen_count,
          weighted_opens, open_rate, shrunk_rate, overall_rate, computed_at
        FROM learned_nudges
        ORDER BY ABS(nudge) DESC, feature_type, feature_value
      `).all();
    },

    replaceLearnedNudges(rows) {
      const insert = sqlite.prepare(`
        INSERT INTO learned_nudges
          (feature_type, feature_value, display_value, nudge, seen_count,
           weighted_opens, open_rate, shrunk_rate, overall_rate, computed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const transaction = sqlite.transaction(values => {
        sqlite.prepare('DELETE FROM learned_nudges').run();
        for (const row of values) {
          insert.run(
            row.feature_type, row.feature_value, row.display_value, row.nudge,
            row.seen_count, row.weighted_opens, row.open_rate, row.shrunk_rate,
            row.overall_rate, row.computed_at
          );
        }
      });
      transaction(rows || []);
    },

    forgetLearning() {
      const transaction = sqlite.transaction(() => {
        sqlite.prepare('DELETE FROM story_events').run();
        sqlite.prepare('DELETE FROM learned_nudges').run();
        sqlite.prepare("DELETE FROM settings WHERE key = 'learning_last_computed_at'").run();
      });
      transaction();
    },

    close() {
      sqlite.close();
    },
  };

  return db;
}

function seedCategories(sqlite) {
  // Ensure the system "Other" category always exists
  const other = sqlite.prepare('SELECT id FROM categories WHERE slug = ?').get(SYSTEM_CATEGORY_SLUG);
  if (!other) {
    const c = DEFAULT_CATEGORIES[0];
    sqlite.prepare(
      'INSERT INTO categories (slug, name, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(c.slug, c.name, c.description, c.icon, c.sort_order);
  }
}

function seedSettings(sqlite) {
  const count = sqlite.prepare('SELECT COUNT(*) as cnt FROM settings').get().cnt;
  if (count > 0) return;

  const stmt = sqlite.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  const tx = sqlite.transaction((settings) => {
    for (const [key, value] of Object.entries(settings)) {
      stmt.run(key, JSON.stringify(value));
    }
  });
  tx(DEFAULT_SETTINGS);
}

function prepareStatements(sqlite) {
  return {
    insertBriefing: sqlite.prepare(
      'INSERT INTO briefings (date, headline, data, item_count) VALUES (?, ?, ?, ?)'
    ),
    getBriefingById: sqlite.prepare('SELECT * FROM briefings WHERE id = ?'),
    getLatestBriefing: sqlite.prepare('SELECT * FROM briefings ORDER BY created_at DESC, id DESC LIMIT 1'),
    listBriefings: sqlite.prepare('SELECT id, date, headline, data, item_count, created_at FROM briefings ORDER BY created_at DESC, id DESC'),
    insertLogEntry: sqlite.prepare(
      'INSERT INTO log_entries (run_id, timestamp, level, component, message, metadata) VALUES (?, ?, ?, ?, ?, ?)'
    ),
  };
}

function briefingListItem(row) {
  let data = null;
  try { data = JSON.parse(row.data); } catch (_) { /* retain stored metadata for malformed legacy rows */ }
  const entries = data ? storyEntries(data.sections) : [];
  const storedCount = Number(row.item_count);
  return {
    id: row.id,
    date: row.date,
    headline: row.headline || (data && data.headline) || (entries[0] && entries[0].item.title) || '',
    item_count: storedCount > 0 ? storedCount : entries.length,
    created_at: row.created_at,
  };
}

function parseStoredArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

module.exports = { initDB };
