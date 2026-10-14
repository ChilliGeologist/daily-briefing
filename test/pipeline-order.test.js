'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

it('runs the pipeline stages in the specified order', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pipeline/index.js'), 'utf8');
  const stages = [...source.matchAll(/emit\(\{ type: 'stage', stage: '([^']+)', status: 'running' \}\)/g)]
    .map(match => match[1]);

  assert.deepStrictEqual(stages, [
    'collect', 'filter', 'cluster', 'rank', 'extract', 'categorise', 'summarise', 'assemble',
  ]);
});
