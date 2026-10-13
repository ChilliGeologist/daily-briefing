'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { sanitiseHtml } = require('../src/pipeline/sanitise');

it('keeps reading tags, strips scripts, handlers and unknown attributes', () => {
  assert.strictEqual(
    sanitiseHtml('<div class="x"><p onclick="evil()">Hi <a href="https://a.com" style="c">there</a></p><script>bad()</script><iframe src="x"></iframe><img src="http://insecure/i.jpg"><img src="https://ok/i.jpg" alt="A"></div>'),
    '<p>Hi <a href="https://a.com" rel="noopener noreferrer" target="_blank">there</a></p><img src="https://ok/i.jpg" alt="A">'
  );
});

it('drops javascript: links but keeps their text', () => {
  assert.strictEqual(sanitiseHtml('<p><a href="javascript:x()">t</a></p>'), '<p>t</p>');
});
