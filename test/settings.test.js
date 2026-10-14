'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { createSettings } = require('../src/settings');
const { DEFAULT_INTERESTS } = require('../src/pipeline/writer/interests');

const fakeDb = vals => ({
  getSetting: key => (key in vals ? vals[key] : null),
  setSetting: (key, value) => { vals[key] = value; },
});

it('returns defaults when unset', () => {
  const settings = createSettings(fakeDb({}));
  assert.strictEqual(settings.getFilterMaxAgeHours(), 36);
  assert.deepStrictEqual(settings.getFillerPatterns(), [
    'weather report for', 'magistrates court list', 'superquiz', 'best of cartoons',
    'crossword', 'horoscope', 'as it happened', 'quick quiz', 'word puzzle',
    'everybody appearing at', 'in case you missed it',
    ...newFillerPatterns,
  ]);
  assert.deepStrictEqual(settings.getPaywalledHosts(), [
    'themercury.com.au', 'examiner.com.au', 'theadvocate.com.au', 'theaustralian.com.au',
  ]);
  assert.strictEqual(settings.getMaxSameStoryChecks(), 40);
  assert.strictEqual(settings.getMaxCandidates(), 120);
  assert.deepStrictEqual(settings.getInterests(), DEFAULT_INTERESTS);
  assert.strictEqual(settings.getWriterOllamaModel(), 'gemma4:26b');
  assert.strictEqual(settings.getOllamaNumCtx(), 8192);
  assert.strictEqual(settings.getWriterArticleChars(), 6000);
  assert.strictEqual(settings.getSectionSize(), 5);
  assert.deepStrictEqual(settings.getTopSize(), { min: 5, max: 7 });
});

it('returns stored values when set', () => {
  const settings = createSettings(fakeDb({
    filter_max_age_hours: 24,
    filler_patterns: ['x'],
    filler_patterns_revision: 1,
    paywalled_hosts: [],
    max_same_story_checks: 5,
    max_candidates: 135,
    interests: [{ label: 'Mine' }],
    writer_ollama_model: 'writer-model',
    ollama_num_ctx: 16384,
    writer_article_chars: 9000,
    section_size: 4,
    top_size: { min: 6, max: 6 },
  }));
  assert.deepStrictEqual([
    settings.getFilterMaxAgeHours(),
    settings.getFillerPatterns(),
    settings.getPaywalledHosts(),
    settings.getMaxSameStoryChecks(),
    settings.getMaxCandidates(),
  ], [24, ['x', ...newFillerPatterns.slice(-4)], [], 5, 135]);
  assert.deepStrictEqual([
    settings.getInterests(),
    settings.getWriterOllamaModel(),
    settings.getOllamaNumCtx(),
    settings.getWriterArticleChars(),
    settings.getSectionSize(),
    settings.getTopSize(),
  ], [
    [{ label: 'Mine' }], 'writer-model', 16384, 9000, 4, { min: 6, max: 6 },
  ]);
});

const newFillerPatterns = [
  'ask away', 'megathread',
  '/\\b(?:daily|weekly|monthly)\\s+(?:discussion|questions?)(?:\\s+(?:discussion|questions?))?\\s+threads?\\b/i',
  '/^\\s*(?:(?:hardware|quick)\\s+question|question|help|need\\s+advice)\\s*\\??\\s*$/i',
  '/\\(YC [WS]\\d{2}\\) is hiring/i',
  '/\\bis hiring\\b/i',
  '/^\\s*revealed:\\s*liquidator appointments for businesses in the .+ council area\\b/i',
  '/\\s[–—-]\\s(?:video|podcast|audio)\\s*$/i',
];

it('upgrades stored filler patterns once without restoring deleted defaults or losing custom patterns', () => {
  const vals = { filler_patterns: ['my custom pattern', 'ask away', 'superquiz'] };
  const db = { getSetting: key => vals[key] ?? null, setSetting: (key, value) => { vals[key] = value; }, getAllSettings: () => ({ ...vals }) };
  const settings = createSettings(db);
  const expected = ['my custom pattern', 'ask away', 'superquiz', ...newFillerPatterns.slice(1)];
  assert.deepStrictEqual(settings.getFillerPatterns(), expected);
  assert.deepStrictEqual(settings.getAll(), { filler_patterns: expected, filler_patterns_revision: 3 });
  settings.set('filler_patterns', ['my custom pattern']);
  assert.deepStrictEqual(createSettings(db).getFillerPatterns(), ['my custom pattern']);
  assert.deepStrictEqual(vals, { filler_patterns: ['my custom pattern'], filler_patterns_revision: 3 });
});

it('seeds fresh filler defaults once and respects an empty list after editing', () => {
  const vals = {};
  const db = { getSetting: key => vals[key] ?? null, setSetting: (key, value) => { vals[key] = value; } };
  const settings = createSettings(db);
  assert.deepStrictEqual(settings.getFillerPatterns(), ['weather report for', 'magistrates court list', 'superquiz', 'best of cartoons', 'crossword', 'horoscope', 'as it happened', 'quick quiz', 'word puzzle', 'everybody appearing at', 'in case you missed it', ...newFillerPatterns]);
  settings.set('filler_patterns', []);
  assert.deepStrictEqual(createSettings(db).getFillerPatterns(), []);
});

it('upgrades a revision 2 install with only the newest patterns, keeping its deletions', () => {
  const vals = { filler_patterns: ['my custom pattern', 'megathread'], filler_patterns_revision: 2 };
  const settings = createSettings(fakeDb(vals));
  assert.deepStrictEqual(settings.getFillerPatterns(), [
    'my custom pattern', 'megathread', '/\\s[–—-]\\s(?:video|podcast|audio)\\s*$/i',
  ]);
  assert.strictEqual(vals.filler_patterns_revision, 3);
});
