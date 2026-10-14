'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { analyseCandidates, formatReport } = require('../scripts/tasmania-places-report');

it('reports place matches and non-matches from candidate story text', () => {
  const report = analyseCandidates([
    { title: 'The Nut at Stanley', description: '', article_content: '' },
    { title: 'Council update', description: 'The decision was made in Launceston.' },
    { title: 'Garth Hamilton addresses media' },
    { title: 'WA housing changes', description: 'New homes are planned for Perth.' },
    { title: 'Stanleyville road works' },
  ]);

  assert.deepStrictEqual(report, {
    matched: [
      { index: 1, title: 'The Nut at Stanley', matches: [
        { name: 'The Nut', tier: 'UNAMBIGUOUS' },
        { name: 'Stanley', tier: 'NEEDS_COMPANION' },
      ] },
      { index: 2, title: 'Council update', matches: [
        { name: 'Launceston', tier: 'UNAMBIGUOUS' },
      ] },
    ],
    rejected: [
      { index: 3, title: 'Garth Hamilton addresses media', matches: [
        { name: 'Hamilton', tier: 'NEEDS_COMPANION' },
      ] },
      { index: 4, title: 'WA housing changes', matches: [
        { name: 'Perth', tier: 'NEEDS_COMPANION' },
      ] },
    ],
    unmatched: [
      { index: 5, title: 'Stanleyville road works', matches: [] },
    ],
  });
  assert.strictEqual(formatReport(report), [
    'MATCHED',
    '[1] The Nut [UNAMBIGUOUS], Stanley [NEEDS_COMPANION] — The Nut at Stanley',
    '[2] Launceston [UNAMBIGUOUS] — Council update',
    '',
    'Rejected (needs a Tasmanian companion)',
    '[3] Hamilton [NEEDS_COMPANION] — Garth Hamilton addresses media',
    '[4] Perth [NEEDS_COMPANION] — WA housing changes',
    '',
    'NO PLACE MATCH',
    '[5] Stanleyville road works',
    '',
  ].join('\n'));
});
