'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let sun = {};
try { sun = require('../public/sun-times'); } catch (_) { /* red run: module not built yet */ }

const { sunTimesForDate, isDarkAt, nextSunBoundary } = sun;
const MINUTE = 60 * 1000;

// Published Launceston times are from timeanddate.com. All are local times and
// include refraction and daylight saving when applicable:
// https://www.timeanddate.com/sun/australia/launceston?month=6&year=2026
// https://www.timeanddate.com/sun/australia/launceston?month=12&year=2026
// https://www.timeanddate.com/sun/australia/launceston?month=10&year=2026
const published = [
  { day: '2026-06-21', sunrise: '2026-06-20T21:37:00.000Z', sunset: '2026-06-21T06:48:00.000Z' },
  { day: '2026-12-21', sunrise: '2026-12-20T18:33:00.000Z', sunset: '2026-12-21T09:44:00.000Z' },
  // Daylight saving starts in Hobart on 4 October 2026.
  { day: '2026-10-04', sunrise: '2026-10-03T19:41:00.000Z', sunset: '2026-10-04T08:20:00.000Z' }
];

test('NOAA sun times stay within three minutes of published Launceston times', () => {
  const actual = published.map(({ day }) => sunTimesForDate(day));

  assert.deepStrictEqual(actual.map(({ sunrise, sunset }) => ({
    sunriseIsDate: sunrise instanceof Date,
    sunsetIsDate: sunset instanceof Date
  })), published.map(() => ({ sunriseIsDate: true, sunsetIsDate: true })));

  actual.forEach(({ sunrise, sunset }, index) => {
    assert.ok(Math.abs(sunrise.getTime() - Date.parse(published[index].sunrise)) <= 3 * MINUTE);
    assert.ok(Math.abs(sunset.getTime() - Date.parse(published[index].sunset)) <= 3 * MINUTE);
  });
});

test('Auto is dark immediately before and light immediately after every sunrise', () => {
  published.forEach(({ day }) => {
    const { sunrise } = sunTimesForDate(day);
    assert.strictEqual(isDarkAt(new Date(sunrise.getTime() - 1)), true);
    assert.strictEqual(isDarkAt(sunrise), false);
    assert.strictEqual(isDarkAt(new Date(sunrise.getTime() + 1)), false);
  });
});

test('Auto is light immediately before and dark immediately after every sunset', () => {
  published.forEach(({ day }) => {
    const { sunset } = sunTimesForDate(day);
    assert.strictEqual(isDarkAt(new Date(sunset.getTime() - 1)), false);
    assert.strictEqual(isDarkAt(sunset), true);
    assert.strictEqual(isDarkAt(new Date(sunset.getTime() + 1)), true);
  });
});

test('nextSunBoundary returns the whole next sunrise or sunset Date', () => {
  const { sunrise, sunset } = sunTimesForDate('2026-06-21');

  assert.deepStrictEqual(nextSunBoundary(new Date(sunrise.getTime() - MINUTE)), sunrise);
  assert.deepStrictEqual(nextSunBoundary(new Date(sunrise.getTime() + MINUTE)), sunset);
  assert.deepStrictEqual(nextSunBoundary(sunset), sunTimesForDate('2026-06-22').sunrise);
});
