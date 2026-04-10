'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS briefings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
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

  CREATE INDEX IF NOT EXISTS idx_briefings_date ON briefings(date);
  CREATE INDEX IF NOT EXISTS idx_log_entries_run_id ON log_entries(run_id);
  CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp);
  CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled);
`;

const DEFAULT_CATEGORIES = [
  { slug: 'top-stories', name: 'Top Stories', description: 'The most important stories of the day', icon: 'star', sort_order: 0 },
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

  // Seed defaults
  seedCategories(sqlite);
  seedSettings(sqlite);

  // Prepare commonly used statements
  const stmts = prepareStatements(sqlite);

  const db = {
    raw: sqlite,

    // --- Briefings ---
    upsertBriefing(date, briefingData) {
      const dataStr = JSON.stringify(briefingData);
      let itemCount = 0;
      if (briefingData && Array.isArray(briefingData.sections)) {
        for (const section of briefingData.sections) {
          if (Array.isArray(section.items)) {
            itemCount += section.items.length;
          }
        }
      }
      const headline = briefingData.headline || null;
      stmts.upsertBriefing.run(date, headline, dataStr, itemCount);
    },

    getBriefing(date) {
      const row = stmts.getBriefing.get(date);
      if (!row) return null;
      return { ...row, data: JSON.parse(row.data) };
    },

    getLatestBriefing() {
      const row = stmts.getLatestBriefing.get();
      if (!row) return null;
      return { ...row, data: JSON.parse(row.data) };
    },

    listBriefings(limit = 90) {
      return stmts.listBriefings.all(limit);
    },

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

    close() {
      sqlite.close();
    },
  };

  return db;
}

function seedCategories(sqlite) {
  const count = sqlite.prepare('SELECT COUNT(*) as cnt FROM categories').get().cnt;
  if (count > 0) return;

  const stmt = sqlite.prepare(
    'INSERT INTO categories (slug, name, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = sqlite.transaction((cats) => {
    for (const c of cats) {
      stmt.run(c.slug, c.name, c.description, c.icon, c.sort_order);
    }
  });
  tx(DEFAULT_CATEGORIES);
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
    upsertBriefing: sqlite.prepare(
      `INSERT INTO briefings (date, headline, data, item_count)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET headline = excluded.headline, data = excluded.data, item_count = excluded.item_count`
    ),
    getBriefing: sqlite.prepare('SELECT * FROM briefings WHERE date = ?'),
    getLatestBriefing: sqlite.prepare('SELECT * FROM briefings ORDER BY date DESC LIMIT 1'),
    listBriefings: sqlite.prepare('SELECT date, headline, item_count, created_at FROM briefings ORDER BY date DESC LIMIT ?'),
    insertLogEntry: sqlite.prepare(
      'INSERT INTO log_entries (run_id, timestamp, level, component, message, metadata) VALUES (?, ?, ?, ?, ?, ?)'
    ),
  };
}

module.exports = { initDB };
