'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let logic = {};
try { logic = require('../public/told-scale'); } catch (_) { /* failing-first: helper not built yet */ }

const { layoutSubject, shortenOutletLabel } = logic;

test('shortenOutletLabel makes scale labels compact without changing ordinary names', () => {
  assert.strictEqual(shortenOutletLabel('The Guardian AU (Google News)'), 'Guardian');
  assert.strictEqual(shortenOutletLabel('Reuters World'), 'Reuters');
  assert.strictEqual(shortenOutletLabel('Local Wire (API)'), 'Local Wire');
  assert.strictEqual(shortenOutletLabel('Ars Technica'), 'Ars');
  assert.strictEqual(shortenOutletLabel('ABC Tasmania'), 'ABC');
  assert.strictEqual(shortenOutletLabel('ABC News Australia'), 'ABC');
  assert.strictEqual(shortenOutletLabel('SBS News'), 'SBS');
  assert.strictEqual(shortenOutletLabel('7NEWS'), '7NEWS');
});

test('layoutSubject merges matching Trump quotes, spreads stance bands, and staggers close labels', () => {
  const scale = layoutSubject({
    name: 'Donald Trump',
    kind: 'person',
    stances: [
      { outlet: '7NEWS', stance: 'against', quote: 'Trump backflips on the planned livestream' },
      { outlet: 'SMH', stance: 'against', quote: 'Trump dumped the controversial plans' },
      { outlet: 'The Age', stance: 'against', quote: 'Trump dumped the controversial plans' },
      { outlet: 'SBS News', stance: 'plain', quote: 'Trump announced the cancellation' },
      { outlet: 'Ars Technica', stance: 'plain', quote: 'Trump cancels Pentagon plans' },
      { outlet: 'Reuters', stance: 'plain', quote: 'Trump shuts down the plan' },
    ],
  });

  assert.strictEqual(scale.name, 'Donald Trump');
  assert.deepStrictEqual(scale.dots.map(dot => ({
    label: dot.label,
    outlets: dot.outlets,
    stance: dot.stance,
    position: dot.position,
    labelRow: dot.labelRow,
  })), [
    { label: '7NEWS', outlets: ['7NEWS'], stance: 'against', position: 6, labelRow: 0 },
    { label: '2 outlets', outlets: ['SMH', 'The Age'], stance: 'against', position: 34, labelRow: 0 },
    { label: 'SBS', outlets: ['SBS News'], stance: 'plain', position: 38, labelRow: 0 },
    { label: 'Ars', outlets: ['Ars Technica'], stance: 'plain', position: 50, labelRow: 1 },
    { label: 'Reuters', outlets: ['Reuters'], stance: 'plain', position: 62, labelRow: 0 },
  ]);
  assert.strictEqual(scale.dots[1].quote, 'Trump dumped the controversial plans');
});

test('layoutSubject centres a single against and a single plain dot in their bands', () => {
  const scale = layoutSubject({
    name: 'Example person',
    stances: [
      { outlet: 'Outlet One', stance: 'against', quote: 'Critical words' },
      { outlet: 'Outlet Two', stance: 'plain', quote: '' },
    ],
  });

  assert.deepStrictEqual(scale.dots.map(dot => [dot.stance, dot.position, dot.labelRow]), [
    ['against', 20, 0],
    ['plain', 50, 0],
  ]);
  assert.strictEqual(scale.dots[1].quote, '');
});

test('layoutSubject uses the full for band and exposes for as the reader-facing stance', () => {
  const scale = layoutSubject({
    name: 'Example party',
    stances: [
      { outlet: 'First', stance: 'toward', quote: 'Supportive one' },
      { outlet: 'Second', stance: 'toward', quote: 'Supportive two' },
    ],
  });

  assert.deepStrictEqual(scale.dots.map(dot => [dot.position, dot.displayStance]), [
    [66, 'for'],
    [94, 'for'],
  ]);
});

test('layoutSubject keeps empty plain quotes valid and merges them when identical', () => {
  const scale = layoutSubject({
    name: 'Example agency',
    stances: [
      { outlet: 'ABC Tasmania', stance: 'plain', quote: '' },
      { outlet: 'Reuters World', stance: 'plain', quote: '' },
    ],
  });

  assert.strictEqual(scale.dots.length, 1);
  assert.deepStrictEqual(scale.dots[0], {
    outlets: ['ABC Tasmania', 'Reuters World'],
    stance: 'plain',
    displayStance: 'plain',
    quote: '',
    position: 50,
    labelRow: 0,
    label: '2 outlets',
  });
});

test('layoutSubject labels a shared quote by outlet count while keeping single outlet names', () => {
  const scale = layoutSubject({
    name: 'Melania Trump',
    stances: [
      { outlet: '7NEWS', stance: 'against', quote: 'Critical framing' },
      { outlet: 'BBC', stance: 'plain', quote: 'The same plain account' },
      { outlet: 'AP', stance: 'plain', quote: 'The same plain account' },
      { outlet: 'Al Jazeera', stance: 'plain', quote: 'The same plain account' },
      { outlet: 'Reuters', stance: 'plain', quote: 'The same plain account' },
      { outlet: 'Daily Telegraph', stance: 'plain', quote: 'The same plain account' },
      { outlet: 'news.com.au', stance: 'plain', quote: 'The same plain account' },
      { outlet: 'Fox News', stance: 'toward', quote: 'Supportive framing' },
    ],
  });

  assert.deepStrictEqual(scale.dots.map(dot => dot.label), [
    '7NEWS',
    '6 outlets',
    'Fox News',
  ]);
  assert.strictEqual(scale.dots[1].outlets.join(' · '),
    'BBC · AP · Al Jazeera · Reuters · Daily Telegraph · news.com.au');
});
