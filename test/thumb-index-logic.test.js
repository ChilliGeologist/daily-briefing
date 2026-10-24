'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let logic = {};
try { logic = require('../public/thumb-index-logic'); } catch (_) { /* red run: helper not built yet */ }

const {
  bowScaleTargets,
  labelLayout,
  nearestSection,
  pillOffset,
  sectionIconId,
} = logic;

function assertNear(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

test('labelLayout spreads labels over the lower 30 to 92 per cent of the height', () => {
  assert.deepStrictEqual(labelLayout(1000, 3), [300, 610, 920]);
  assert.deepStrictEqual(labelLayout(500, 1), [150]);
  assert.deepStrictEqual(labelLayout(500, 0), []);
});

test('nearestSection chooses the closest label and keeps the first on a tie', () => {
  const positions = [300, 610, 920];
  assert.deepStrictEqual([
    nearestSection(0, positions),
    nearestSection(455, positions),
    nearestSection(456, positions),
    nearestSection(2000, positions),
    nearestSection(20, []),
  ], [0, 0, 1, 2, -1]);
});

test('bowScaleTargets uses the prototype Gaussian and story-picking reach', () => {
  assert.deepStrictEqual(bowScaleTargets({ labelY: 400, fingerY: 400 }), { x: -46, scale: 2.15 });
  assertNear(bowScaleTargets({ labelY: 444, fingerY: 400 }).x, -46 * Math.exp(-1));
  assertNear(bowScaleTargets({ labelY: 444, fingerY: 400 }).scale, 1 + 1.15 * Math.exp(-1));
  assertNear(bowScaleTargets({ labelY: 400, fingerY: 400, picking: true }).x, -46 * 0.35);
  assert.deepStrictEqual(
    bowScaleTargets({ labelY: 400, fingerY: 400, reducedMotion: true }),
    { x: 0, scale: 1 },
  );
});

test('pillOffset keeps the pill ten pixels beyond the scaled icon outer edge', () => {
  assert.strictEqual(pillOffset({ iconX: 0, iconScale: 1 }), -37);
  assertNear(pillOffset({ iconX: -46, iconScale: 2.15 }), -103.7);
});

test('sectionIconId accepts reading-screen ids including sport and sends every unknown id to the front page', () => {
  const ids = ['top', 'tasmania', 'australia', 'world', 'tech', 'homelab', 'gaming', 'sport', 'internet'];
  assert.deepStrictEqual(ids.map(sectionIconId), ids);
  assert.deepStrictEqual([
    sectionIconId('constructor'),
    sectionIconId('you-should-know'),
    sectionIconId(''),
    sectionIconId(undefined),
  ], ['top', 'top', 'top', 'top']);
});
