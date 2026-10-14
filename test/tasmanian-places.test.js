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
    ['The Nut', 'Ulverstone', 'Devonport', 'Deloraine', 'Strahan', 'Zeehan', 'Smithton', 'Bicheno', 'Huonville', 'Geeveston', 'Glenorchy', 'Legana', 'Invermay', 'kunanyi'].map(name => UNAMBIGUOUS.includes(name)),
    [true, true, true, true, true, true, true, true, true, true, true, true, true, true]
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
    unambiguous: ['Central Highlands'],
    needsCompanion: ['Hamilton'],
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
