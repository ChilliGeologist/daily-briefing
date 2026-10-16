'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const {
  NEEDS_COMPANION,
  TASMANIAN_PLACES,
  UNAMBIGUOUS,
  matchTasmanianPlaces,
} = require('../src/pipeline/writer/tasmanian-places');

it('exports frozen unambiguous and companion-required gazetteer tiers', () => {
  assert.strictEqual(Object.isFrozen(TASMANIAN_PLACES), true);
  assert.strictEqual(Object.isFrozen(UNAMBIGUOUS), true);
  assert.strictEqual(Object.isFrozen(NEEDS_COMPANION), true);
  assert.deepStrictEqual(
    ['The Nut', 'Ulverstone', 'Devonport', 'Deloraine', 'Strahan', 'Zeehan', 'Smithton', 'Bicheno', 'Huonville', 'Geeveston', 'Glenorchy', 'Legana', 'kunanyi'].map(name => UNAMBIGUOUS.includes(name)),
    [true, true, true, true, true, true, true, true, true, true, true, true, true]
  );
  assert.deepStrictEqual(
    ['Perth', 'Margate', 'Hamilton', 'Prospect', 'Forth', 'Riverside', 'Stanley'].map(name => NEEDS_COMPANION.includes(name)),
    [true, true, true, true, true, true, true]
  );
  assert.deepStrictEqual(TASMANIAN_PLACES, [...UNAMBIGUOUS, ...NEEDS_COMPANION]);
});

it('accepts companion-required names only with Tasmanian evidence in the same text', () => {
  assert.deepStrictEqual(matchTasmanianPlaces('Garth Hamilton'), {
    unambiguous: [],
    needsCompanion: [],
    rejected: ['Hamilton'],
    companions: [],
  });
  assert.deepStrictEqual(matchTasmanianPlaces("Hamilton, in Tasmania's Central Highlands"), {
    unambiguous: [],
    needsCompanion: ['Hamilton', 'Central Highlands'],
    rejected: [],
    companions: ['Tasmania'],
  });
  assert.deepStrictEqual(matchTasmanianPlaces('Stanley'), {
    unambiguous: [],
    needsCompanion: [],
    rejected: ['Stanley'],
    companions: [],
  });
  assert.deepStrictEqual(matchTasmanianPlaces('The Nut at Stanley'), {
    unambiguous: ['The Nut'],
    needsCompanion: ['Stanley'],
    rejected: [],
    companions: [],
  });
});

it('treats a Tasmanian source as the companion for shared names', () => {
  assert.deepStrictEqual(matchTasmanianPlaces('Moving to Claremont or Kingston?', [], { tasmanianSource: true }), {
    unambiguous: [],
    needsCompanion: ['Claremont', 'Kingston'],
    rejected: [],
    companions: [],
  });
  assert.deepStrictEqual(matchTasmanianPlaces('Moving to Claremont or Kingston?'), {
    unambiguous: [],
    needsCompanion: [],
    rejected: ['Claremont', 'Kingston'],
    companions: [],
  });
});

it('recognises only Tasmanian subreddits as Tasmanian sources', () => {
  const { isTasmanianSource } = require('../src/pipeline/writer/tasmanian-places');
  assert.deepStrictEqual([
    isTasmanianSource({ sources: [{ name: 'r/tasmania' }] }),
    isTasmanianSource({ source_name: 'r/Hobart' }),
    isTasmanianSource({ source_name: 'r/launceston' }),
    isTasmanianSource({ sources: [{ name: 'ABC Tasmania' }, { name: '7NEWS' }] }),
    isTasmanianSource({ source_name: 'Pulse Tasmania' }),
    isTasmanianSource({ sources: [{ name: 'The Mercury (Google News)' }, { name: 'The Examiner' }] }),
    isTasmanianSource({}),
  ], [true, true, true, false, false, false, false]);
});
