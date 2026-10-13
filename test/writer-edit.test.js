'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { editStories } = require('../src/pipeline/writer/edit');

function stories() {
  return [
    { id: 's1', section: 'world', coverage: 4, interest_matches: [], rank: 1, kicker: 'One', headline: 'One', summary: 'One.' },
    { id: 's2', section: 'tasmania', coverage: 1, interest_matches: [{ label: 'Local', weight: 3 }], rank: 2, kicker: 'Two', headline: 'Two', summary: 'Two.' },
    { id: 's3', section: 'world', coverage: 1, interest_matches: [], rank: 3, kicker: 'Three', headline: 'Three', summary: 'Three.' },
    { id: 's4', section: 'world', coverage: 1, interest_matches: [], rank: 4, kicker: 'Four', headline: 'Four', summary: 'Four.' },
    { id: 's5', section: 'world', coverage: 1, interest_matches: [], rank: 5, kicker: 'Five', headline: 'Five', summary: 'Five.' },
    { id: 's6', section: 'world', coverage: 1, interest_matches: [], rank: 6, kicker: 'Six', headline: 'Six', summary: 'Six.' },
    { id: 's7', section: 'world', coverage: 1, interest_matches: [], rank: 7, kicker: 'Seven', headline: 'Seven', summary: 'Seven.' },
    { id: 's8', section: 'world', coverage: 1, interest_matches: [], rank: 8, kicker: 'Eight', headline: 'Eight', summary: 'Eight.' },
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
  Object.defineProperty(response, 'model', { value: 'claude-sonnet-5-5' });
  const logs = [];
  const output = await editStories(stories(), { async edit() { return response; } }, settings, {
    info: (...args) => logs.push(['info', ...args]),
    warn: (...args) => logs.push(['warn', ...args]),
  });

  assert.deepStrictEqual(output, {
    top: ['s2', 's1', 's3', 's4', 's5'],
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], internet: [] },
    stats: { input_tokens: 1000000, output_tokens: 1000000, cost_usd: 12, duration_ms: 42, edit_fallback: false },
  });
  assert.deepStrictEqual(logs, [
    ['warn', 'pipeline:editor', 'Editor output needed repair', { problems: [
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
    sections: { tasmania: [], australia: [], world: ['s6', 's7'], tech: [], homelab: [], gaming: [], internet: [] },
    more: { tasmania: [], australia: [], world: ['s8'], tech: [], homelab: [], gaming: [], internet: [] },
    stats: { input_tokens: 0, output_tokens: 0, cost_usd: 0, duration_ms: 0, edit_fallback: true },
  });
  assert.deepStrictEqual(logs, [
    ['warn', 'pipeline:editor', 'Editor failed, using deterministic order: editor offline'],
    ['info', 'pipeline:editor', 'Edited: 5 top, 2 in sections'],
  ]);
});
