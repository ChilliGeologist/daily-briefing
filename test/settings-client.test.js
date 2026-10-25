'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('settings is one page with the agreed contents and controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.deepStrictEqual({
    headings: ['Your interests', 'Sources', 'Notifications', 'The paper', 'Behind the scenes']
      .map(label => html.includes('>' + label + '<')),
    controls: ['Can interrupt me', 'Only near home', 'Try it', 'Send me a test', 'Reset to the starting list']
      .map(label => app.includes(label)),
    folded: html.includes('<details id="behind-the-scenes"'),
    categories_tab: html.includes('data-tab="categories"'),
    preferences_tab: html.includes('data-tab="preferences"'),
  }, {
    headings: [true, true, true, true, true],
    controls: [true, true, true, true, true],
    folded: true,
    categories_tab: false,
    preferences_tab: false,
  });
});
