'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { editStories } = require('../src/pipeline/writer/edit');

function stories() {
  return [
    { id: 's1', section: 'world', coverage: 4, interest_matches: [], rank: 1, kicker: 'One', headline: 'One', summary: 'One.' },
    { id: 's2', section: 'tasmania', coverage: 1, interest_matches: [{ label: 'Local', weight: 3 }], rank: 2, kicker: 'Two', headline: 'Two', summary: 'Two.' },
    { id: 's3', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 3, kicker: 'Three', headline: 'Three', summary: 'Three.' },
    { id: 's4', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 4, kicker: 'Four', headline: 'Four', summary: 'Four.' },
    { id: 's5', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 5, kicker: 'Five', headline: 'Five', summary: 'Five.' },
    { id: 's6', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 6, kicker: 'Six', headline: 'Six', summary: 'Six.' },
    { id: 's7', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 7, kicker: 'Seven', headline: 'Seven', summary: 'Seven.' },
    { id: 's8', section: 'world', coverage: 1, interest_matches: [{ weight: 1 }], rank: 8, kicker: 'Eight', headline: 'Eight', summary: 'Eight.' },
  ];
}

const settings = {
  getSectionSize: () => 2,
  getTopSize: () => ({ min: 5, max: 7 }),
};

it('repairs editor ids and reports measured edit stats', async () => {
  const response = {
    json: { top: ['missing', 's2', 's2'], sections: { world: ['s1', 's3'] } },
    usage: { input_tokens: 1000000, output_tokens: 1000000 },
    duration_ms: 42,
  };
  const logs = [];
  const output = await editStories(stories(), { async edit() { return response; } }, settings, {
    info: (...args) => logs.push(['info', ...args]),
    warn: (...args) => logs.push(['warn', ...args]),
  });

  assert.deepStrictEqual(output, {
    top: ['s1', 's2', 's3', 's4', 's5'],
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    problems: [
      'Unknown top story id: missing',
      'Duplicate top story id: s2',
      'Top list had fewer than 5 valid stories and was filled',
      'Story s1 was already selected for top',
      'Story s3 was already selected for top',
    ],
    stats: { input_tokens: 1000000, output_tokens: 1000000, duration_ms: 42, edit_fallback: 'partial', top_replacements: 0 },
  });
  assert.deepStrictEqual(logs, [
    ['info', 'pipeline:editor', 'Editor output needed repair', { problems: [
      'Unknown top story id: missing',
      'Duplicate top story id: s2',
      'Top list had fewer than 5 valid stories and was filled',
      'Story s1 was already selected for top',
      'Story s3 was already selected for top',
    ] }],
    ['info', 'pipeline:editor', 'Edited: 5 top, 2 in sections'],
  ]);
});

it('uses the deterministic edit entirely when the editor throws', async () => {
  const logs = [];
  const output = await editStories(stories(), { async edit() { throw new Error('editor offline'); } }, settings, {
    info: (...args) => logs.push(['info', ...args]),
    warn: (...args) => logs.push(['warn', ...args]),
  });
  assert.deepStrictEqual(output, {
    top: ['s1', 's2', 's3', 's4', 's5'],
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    problems: [],
    stats: { input_tokens: 0, output_tokens: 0, duration_ms: 0, edit_fallback: 'full', top_replacements: 0 },
  });
  assert.deepStrictEqual(logs, [
    ['warn', 'pipeline:editor', 'Editor failed, using deterministic order: editor offline'],
    ['info', 'pipeline:editor', 'Edited: 5 top, 2 in sections'],
  ]);
});

it('records deterministic top-story replacements in edit stats', async () => {
  const candidates = [
    { id: 's1', section: 'tech', coverage: 2, interest_matches: [], rank: 1, kicker: 'One', headline: 'One', summary: 'One.', sources: [{ name: 'Reddit' }] },
    { id: 's2', section: 'tech', coverage: 2, interest_matches: [], rank: 2, kicker: 'Two', headline: 'Two', summary: 'Two.', sources: [{ name: 'Wired' }] },
    { id: 's3', section: 'homelab', coverage: 2, interest_matches: [], rank: 3, kicker: 'Three', headline: 'Three', summary: 'Three.', sources: [{ name: 'The Register' }] },
    { id: 's4', section: 'gaming', coverage: 2, interest_matches: [], rank: 4, kicker: 'Four', headline: 'Four', summary: 'Four.', sources: [{ name: 'Games Industry' }] },
    { id: 's5', section: 'world', coverage: 2, interest_matches: [], rank: 5, kicker: 'Five', headline: 'Five', summary: 'Five.', sources: [{ name: 'Reuters' }] },
    { id: 's6', section: 'tasmania', coverage: 2, interest_matches: [], rank: 6, kicker: 'Six', headline: 'Six', summary: 'Six.', sources: [{ name: 'ABC Tasmania' }] },
    { id: 's7', section: 'australia', coverage: 2, interest_matches: [], rank: 7, kicker: 'Seven', headline: 'Seven', summary: 'Seven.', sources: [{ name: 'ABC News' }] },
  ];
  const output = await editStories(candidates, {
    async edit() { return { json: { top: ['s1', 's2', 's3', 's4', 's5'], sections: {} } }; },
  }, settings, { info() {}, warn() {} });
  assert.deepStrictEqual(output, {
    top: ['s2', 's3', 's5', 's6', 's7'],
    sections: { tasmania: [], australia: [], world: [], tech: ['s1'], homelab: [], gaming: ['s4'], sport: [], internet: [] },
    more: { tasmania: [], australia: [], world: [], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    problems: [
      'Top story s1 was replaced by s6 (community-only source)',
      'Top story s4 was replaced by s7 (more than two tech/community sections)',
    ],
    stats: { input_tokens: 0, output_tokens: 0, duration_ms: 0, edit_fallback: 'partial', top_replacements: 2 },
  });
});
