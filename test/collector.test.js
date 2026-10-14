'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { assignListPositions } = require('../src/pipeline/collector');

it('numbers items 1..n and keeps an existing list_position', () => {
  assert.deepStrictEqual(
    assignListPositions([{ t: 'a' }, { t: 'b', list_position: 9 }, { t: 'c' }]).map(i => i.list_position),
    [1, 9, 3]);
});
