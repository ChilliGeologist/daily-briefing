'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let geometry = {};
try { geometry = require('../public/curl-geometry'); } catch (_) { /* red run: module not built yet */ }

const { nearestCorner, clipHalf, curlFrame } = geometry;
const EPSILON = 1e-9;

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= EPSILON, message || `${actual} is not within ${EPSILON} of ${expected}`);
}

function closePoint(actual, expected, message) {
  assert.strictEqual(actual.length, expected.length, message);
  for (let index = 0; index < expected.length; index++) close(actual[index], expected[index], message);
}

function signedDistance(point, midpoint, normal) {
  return (point[0] - midpoint[0]) * normal[0] + (point[1] - midpoint[1]) * normal[1];
}

function reflect(point, reflection) {
  const matrix = reflection.matrix;
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + reflection.translation[0],
    matrix[2] * point[0] + matrix[3] * point[1] + reflection.translation[1]
  ];
}

test('nearestCorner chooses top at the midpoint and bottom below it', () => {
  assert.deepStrictEqual(nearestCorner(0, 600), { cornerY: 0, sign: -1 });
  assert.deepStrictEqual(nearestCorner(300, 600), { cornerY: 0, sign: -1 });
  assert.deepStrictEqual(nearestCorner(300.001, 600), { cornerY: 600, sign: 1 });
  assert.deepStrictEqual(nearestCorner(600, 600), { cornerY: 600, sign: 1 });
});

test('clipHalf splits a rectangle on a vertical crease', () => {
  assert.deepStrictEqual(clipHalf(100, 60, [40, 0], [1, 0], true), [
    [40, 0], [100, 0], [100, 60], [40, 60]
  ]);
  assert.deepStrictEqual(clipHalf(100, 60, [40, 0], [1, 0], false), [
    [0, 0], [40, 0], [40, 60], [0, 60]
  ]);
});

test('clipHalf splits a rectangle on a horizontal crease', () => {
  assert.deepStrictEqual(clipHalf(100, 60, [0, 20], [0, 1], true), [
    [100, 20], [100, 60], [0, 60], [0, 20]
  ]);
  assert.deepStrictEqual(clipHalf(100, 60, [0, 20], [0, 1], false), [
    [0, 0], [100, 0], [100, 20], [0, 20]
  ]);
});

test('curlFrame uses the approved finger, sine lift and midpoint formulae', () => {
  const frame = curlFrame({ width: 200, height: 300, progress: 0.25, cornerY: 300, sign: 1, dragY: 20 });
  const lift = 90 * Math.sin(Math.PI * 0.25);

  close(frame.lift, lift);
  closePoint(frame.grabCorner, [200, 300]);
  closePoint(frame.finger, [100, 320 - lift]);
  closePoint(frame.midpoint, [150, 310 - lift / 2]);
});

test('curlFrame returns a unit normal and perpendicular crease direction', () => {
  const frame = curlFrame({ width: 350, height: 660, progress: 0.42, cornerY: 660, sign: 1, dragY: -16 });

  close(Math.hypot(frame.normal[0], frame.normal[1]), 1);
  close(Math.hypot(frame.creaseDirection[0], frame.creaseDirection[1]), 1);
  close(frame.normal[0] * frame.creaseDirection[0] + frame.normal[1] * frame.creaseDirection[1], 0);
  close(frame.creaseAngle, Math.atan2(frame.normal[1], frame.normal[0]) * 180 / Math.PI);
});

test('curlFrame front and flap polygons stay on complementary crease sides', () => {
  const frame = curlFrame({ width: 350, height: 660, progress: 0.36, cornerY: 0, sign: -1, dragY: 12 });

  assert.deepStrictEqual(frame.frontPolygon.map(point => signedDistance(point, frame.midpoint, frame.normal) <= EPSILON), frame.frontPolygon.map(() => true));
  assert.deepStrictEqual(frame.flapPolygon.map(point => signedDistance(point, frame.midpoint, frame.normal) >= -EPSILON), frame.flapPolygon.map(() => true));
});

test('curlFrame reflection maps the grab corner to the finger point', () => {
  const frame = curlFrame({ width: 350, height: 660, progress: 0.58, cornerY: 660, sign: 1, dragY: 31 });

  closePoint(reflect(frame.grabCorner, frame.reflection), frame.finger);
});

test('curlFrame reflection leaves points on the crease fixed', () => {
  const frame = curlFrame({ width: 320, height: 640, progress: 0.48, cornerY: 0, sign: -1, dragY: -22 });
  const creasePoint = [
    frame.midpoint[0] + frame.creaseDirection[0] * 87,
    frame.midpoint[1] + frame.creaseDirection[1] * 87
  ];

  closePoint(reflect(frame.midpoint, frame.reflection), frame.midpoint);
  closePoint(reflect(creasePoint, frame.reflection), creasePoint);
});

test('curlFrame returns the exact approved light and shadow constants', () => {
  const frame = curlFrame({ width: 400, height: 700, progress: 0.1, cornerY: 700, sign: 1, dragY: 0 });
  const foldWidth = Math.max(20, Math.hypot(
    frame.grabCorner[0] - frame.finger[0],
    frame.grabCorner[1] - frame.finger[1]
  ) / 2);

  close(frame.foldWidth, foldWidth);
  assert.deepStrictEqual(frame.lighting.curl.strengths, [0.28, 0.55, 0.12, 0.10, 0.18]);
  closePoint(frame.lighting.curl.widths, [0, foldWidth * 0.18, foldWidth * 0.45, foldWidth, foldWidth * 1.6]);
  close(frame.lighting.crease.strength, 0.22 * Math.min(1, 4 * 0.1));
  close(frame.lighting.crease.width, Math.min(36, 0.5 * foldWidth));
  close(frame.lighting.cast.strength, 0.45 * (1 - 0.1));
  close(frame.lighting.cast.width, 30 + 50 * (1 - 0.1));
});

test('curlFrame clamps progress before applying geometry and lighting', () => {
  const before = curlFrame({ width: 100, height: 200, progress: -2, cornerY: 0, sign: -1, dragY: 0 });
  const after = curlFrame({ width: 100, height: 200, progress: 3, cornerY: 200, sign: 1, dragY: 0 });

  assert.strictEqual(before.progress, 0);
  assert.strictEqual(after.progress, 1);
  closePoint(before.finger, [100, 0]);
  closePoint(after.finger, [-100, 200]);
  close(before.lighting.cast.strength, 0.45);
  close(after.lighting.cast.strength, 0);
});
