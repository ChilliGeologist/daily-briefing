'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { createSettings } = require('../src/settings');
const { DEFAULT_INTERESTS } = require('../src/pipeline/writer/interests');
const settingsRoute = require('../src/routes/settings');

const fakeDb = vals => ({ getSetting: key => (key in vals ? vals[key] : null) });

it('returns defaults when unset', () => {
  const settings = createSettings(fakeDb({}));
  assert.strictEqual(settings.getFilterMaxAgeHours(), 36);
  assert.deepStrictEqual(settings.getFillerPatterns(), [
    'weather report for', 'magistrates court list', 'superquiz', 'best of cartoons',
    'crossword', 'horoscope', 'as it happened', 'quick quiz', 'word puzzle',
  ]);
  assert.deepStrictEqual(settings.getPaywalledHosts(), [
    'themercury.com.au', 'examiner.com.au', 'theadvocate.com.au', 'theaustralian.com.au',
  ]);
  assert.strictEqual(settings.getMaxSameStoryChecks(), 40);
  assert.deepStrictEqual(settings.getInterests(), DEFAULT_INTERESTS);
  assert.strictEqual(settings.getWriter(), 'ollama');
  assert.strictEqual(settings.getAnthropicApiKey(), null);
  assert.strictEqual(settings.getAnthropicWriteModel(), 'claude-haiku-4-5');
  assert.strictEqual(settings.getAnthropicEditModel(), 'claude-sonnet-5-5');
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
    paywalled_hosts: [],
    max_same_story_checks: 5,
    interests: [{ label: 'Mine' }],
    writer: 'anthropic',
    anthropic_api_key: 'secret-key',
    anthropic_write_model: 'write-model',
    anthropic_edit_model: 'edit-model',
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
  ], [24, ['x'], [], 5]);
  assert.deepStrictEqual([
    settings.getInterests(),
    settings.getWriter(),
    settings.getAnthropicApiKey(),
    settings.getAnthropicWriteModel(),
    settings.getAnthropicEditModel(),
    settings.getWriterOllamaModel(),
    settings.getOllamaNumCtx(),
    settings.getWriterArticleChars(),
    settings.getSectionSize(),
    settings.getTopSize(),
  ], [
    [{ label: 'Mine' }], 'anthropic', 'secret-key', 'write-model', 'edit-model',
    'writer-model', 16384, 9000, 4, { min: 6, max: 6 },
  ]);
});

it('masks the Anthropic key in both settings GET handlers and preserves null', () => {
  const db = { getSetting: () => null };
  const settings = {
    getAll: () => ({ app_title: 'Daily', anthropic_api_key: 'never-return-this' }),
    getAnthropicApiKey: () => 'sk-ant-secret1234',
  };
  const router = settingsRoute(db, settings, { refreshSchedule() {} });
  const handler = routePath => router.stack.find(layer => layer.route && layer.route.path === routePath).route.stack[0].handle;
  const responses = [];
  const res = { json: value => { responses.push(value); return res; }, status: () => res };

  handler('/settings')({}, res);
  handler('/settings/:key')({ params: { key: 'anthropic_api_key' } }, res);
  assert.deepStrictEqual(responses, [
    { app_title: 'Daily', anthropic_api_key: '••••1234' },
    { key: 'anthropic_api_key', value: '••••1234' },
  ]);
  assert.strictEqual(settingsRoute.maskAnthropicApiKey(null), null);
});
