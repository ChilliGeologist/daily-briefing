'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { SECTIONS, TOP_SECTION, isSectionId } = require('../src/pipeline/writer/sections');

it('defines the ordered briefing sections and top section exactly', () => {
  assert.deepStrictEqual(SECTIONS, [
    { id: 'tasmania', title: 'Tasmania' },
    { id: 'australia', title: 'Australia' },
    { id: 'world', title: 'World' },
    { id: 'tech', title: 'Tech & Security' },
    { id: 'homelab', title: 'Homelab & Self-hosting' },
    { id: 'gaming', title: 'Gaming' },
    { id: 'internet', title: 'Around the internet' },
  ]);
  assert.deepStrictEqual(TOP_SECTION, { id: 'top', title: 'You should know' });
});

it('recognises only regular section ids', () => {
  assert.deepStrictEqual(
    ['tasmania', 'australia', 'world', 'tech', 'homelab', 'gaming', 'internet', 'top', '', null]
      .map(isSectionId),
    [true, true, true, true, true, true, true, false, false, false]
  );
});
