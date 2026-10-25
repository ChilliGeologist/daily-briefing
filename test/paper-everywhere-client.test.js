'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

test('paper times use a long en-AU date and lower-case unspaced am/pm', () => {
  const start = appSource.indexOf('function formatDisplayTime(');
  const end = appSource.indexOf('\nfunction el(', start);
  assert.notStrictEqual(start, -1, 'formatDisplayTime should be defined');
  assert.notStrictEqual(end, -1, 'time helpers should precede el');

  const helpers = appSource.slice(start, end);
  const format = Function('value', `${helpers}; return formatLastPaper(value);`);
  const displayTime = Function('value', `${helpers}; return formatDisplayTime(value);`);
  const morning = new Date(2026, 9, 24, 6, 0).toISOString();
  const evening = new Date(2026, 9, 25, 19, 7).toISOString();

  assert.strictEqual(format(morning), 'Last paper: Saturday 24 October, 6:00am');
  assert.strictEqual(format(evening), 'Last paper: Sunday 25 October, 7:07pm');
  assert.strictEqual(displayTime(evening), '7:07 pm');
});

test('status uses the Paper label contract', () => {
  assert.strictEqual(appSource.includes("textContent: 'Write a paper now'"), true);
  assert.strictEqual(appSource.includes("textContent: 'Show the log'"), true);
  assert.strictEqual(appSource.includes("'Last paper: '"), true);
  assert.strictEqual(appSource.includes("textContent: 'Run Now'"), false);
  assert.strictEqual(appSource.includes('confirm('), false);
  assert.strictEqual(appSource.includes("className: 'paper-confirm'"), true);
});
