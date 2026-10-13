'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { createSettings } = require('../src/settings');

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
});

it('returns stored values when set', () => {
  const settings = createSettings(fakeDb({
    filter_max_age_hours: 24,
    filler_patterns: ['x'],
    paywalled_hosts: [],
    max_same_story_checks: 5,
  }));
  assert.deepStrictEqual([
    settings.getFilterMaxAgeHours(),
    settings.getFillerPatterns(),
    settings.getPaywalledHosts(),
    settings.getMaxSameStoryChecks(),
  ], [24, ['x'], [], 5]);
});
