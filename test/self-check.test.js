'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const childProcess = require('node:child_process');
const path = require('node:path');

it('self-check ignores absent detail and reports a summary over 45 words', () => {
  const file = path.join(__dirname, 'fixtures', 'self-check-summary-over-45.json');
  const result = childProcess.spawnSync(process.execPath, ['scripts/self-check.js', file], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  assert.deepStrictEqual({ status: result.status, stdout: result.stdout, stderr: result.stderr }, {
    status: 1,
    stdout: `Edition 2026-10-15\n  You should know: 1 stories from 1 sources\n  1 stories in all\n\n1 problem(s):\n  - summary over 45 words (46): A useful complete headline\n`,
    stderr: '',
  });
});
