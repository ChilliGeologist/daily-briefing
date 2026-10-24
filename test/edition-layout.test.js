'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let logic = {};
try { logic = require('../public/edition-layout'); } catch (_) { /* failing-first run: helper not built yet */ }

const {
  balanceColumnHeights,
  frontPagePictureIndex,
  layoutForWidth,
  planSectionBands,
  prepareToldPanel,
  readerImageUrls,
  topSplit,
} = logic;

function group(id, count) {
  return {
    section: { id, title: id },
    shown: Array.from({ length: count }, (_, index) => ({ id: id + '-' + index })),
    hidden: [],
  };
}

test('layoutForWidth implements phone, tablet and broadsheet column and margin rules', () => {
  assert.deepStrictEqual(layoutForWidth(390), {
    viewportWidth: 390, paperWidth: 390, sideMargin: 0,
    columns: 1, pairedColumns: 1, topRemainderColumns: 1,
  });
  assert.deepStrictEqual(layoutForWidth(820), {
    viewportWidth: 820, paperWidth: 820, sideMargin: 0,
    columns: 2, pairedColumns: 1, topRemainderColumns: 1,
  });
  assert.deepStrictEqual(layoutForWidth(1280), {
    viewportWidth: 1280, paperWidth: 1280, sideMargin: 0,
    columns: 3, pairedColumns: 2, topRemainderColumns: 1,
  });
  assert.deepStrictEqual(layoutForWidth(1920), {
    viewportWidth: 1920, paperWidth: 1920, sideMargin: 0,
    columns: 5, pairedColumns: 3, topRemainderColumns: 3,
  });
});

test('layoutForWidth changes to four columns at 1360 and five at 1900', () => {
  assert.deepStrictEqual(layoutForWidth(1023), {
    viewportWidth: 1023, paperWidth: 820, sideMargin: 101.5,
    columns: 2, pairedColumns: 1, topRemainderColumns: 1,
  });
  assert.deepStrictEqual(layoutForWidth(1024), {
    viewportWidth: 1024, paperWidth: 1024, sideMargin: 0,
    columns: 3, pairedColumns: 2, topRemainderColumns: 1,
  });
  assert.strictEqual(layoutForWidth(1359).columns, 3);
  assert.strictEqual(layoutForWidth(1360).columns, 4);
  assert.strictEqual(layoutForWidth(1899).columns, 4);
  assert.strictEqual(layoutForWidth(1900).columns, 5);
});

test('topSplit never leaves a column beside the lead empty', () => {
  assert.deepStrictEqual(topSplit(5, 4), { leadSpan: 3, restColumns: 2 });
  assert.deepStrictEqual(topSplit(5, 6), { leadSpan: 2, restColumns: 3 });
  assert.deepStrictEqual(topSplit(4, 4), { leadSpan: 2, restColumns: 2 });
  assert.deepStrictEqual(topSplit(3, 4), { leadSpan: 2, restColumns: 1 });
  assert.deepStrictEqual(topSplit(5, 1), { leadSpan: 4, restColumns: 1 });
  assert.deepStrictEqual(topSplit(2, 4), { leadSpan: 2, restColumns: 1 });
});

test('planSectionBands pairs only consecutive ordinary sections with six or fewer stories', () => {
  const top = group('top', 5);
  const tasmania = group('tasmania', 6);
  const australia = group('australia', 4);
  const world = group('world', 7);
  const gaming = group('gaming', 3);
  const sport = group('sport', 4);
  const internet = group('internet', 2);

  assert.deepStrictEqual(planSectionBands([
    top, tasmania, australia, world, gaming, sport, internet,
  ]), [
    { shared: false, sections: [top] },
    { shared: true, sections: [tasmania, australia] },
    { shared: false, sections: [world] },
    { shared: true, sections: [gaming, sport] },
    { shared: false, sections: [internet] },
  ]);
});

test('planSectionBands does not mutate its input and does not pair the top section', () => {
  const top = group('top', 2);
  const world = group('world', 2);
  const input = [top, world];
  assert.deepStrictEqual(planSectionBands(input), [
    { shared: false, sections: [top] },
    { shared: false, sections: [world] },
  ]);
  assert.deepStrictEqual(input, [top, world]);
});

test('frontPagePictureIndex selects the lead for top and first pictured story elsewhere', () => {
  const stories = [
    { id: 'one' },
    { id: 'two', images: ['https://example.test/two.jpg'] },
    { id: 'three', image: 'https://example.test/three.jpg' },
  ];
  assert.strictEqual(frontPagePictureIndex(stories, true), -1);
  assert.strictEqual(frontPagePictureIndex([{ image: 'https://example.test/lead.jpg' }, ...stories], true), 0);
  assert.strictEqual(frontPagePictureIndex(stories, false), 1);
});

test('readerImageUrls returns every unique photo and falls back to the legacy image', () => {
  assert.deepStrictEqual(readerImageUrls({
    image: 'https://example.test/one.jpg',
    images: [
      'https://example.test/one.jpg',
      'https://example.test/two.jpg',
      'https://example.test/two.jpg',
      '',
    ],
  }), ['https://example.test/one.jpg', 'https://example.test/two.jpg']);
  assert.deepStrictEqual(readerImageUrls({ image: 'https://example.test/legacy.jpg' }), [
    'https://example.test/legacy.jpg',
  ]);
});

test('prepareToldPanel groups stances without political-axis labels', () => {
  const panel = prepareToldPanel({
    outlets: [
      { name: 'The Mercury', headline: 'Shock accusation against senator', url: 'https://example.test/m' },
      { name: 'The Guardian AU', headline: 'Senator takes leave', url: 'https://example.test/g' },
      { name: 'news.com.au', headline: 'Shock accusation', url: 'https://example.test/n' },
    ],
    subjects: [{
      name: 'Jordon Steele-John',
      kind: 'person',
      stances: [
        { outlet: 'The Guardian AU', stance: 'plain', quote: 'takes leave' },
        { outlet: 'news.com.au', stance: 'against', quote: 'Shock accusation' },
        { outlet: 'The Mercury', stance: 'against', quote: 'Shock accusation' },
        { outlet: 'Unknown', stance: 'left', quote: 'must never render' },
      ],
    }],
    differs: true,
  });

  assert.strictEqual(panel.outletCount, 3);
  assert.strictEqual(panel.differs, true);
  assert.strictEqual(panel.sameWay, false);
  assert.deepStrictEqual(panel.subjects[0].groups.map(group => [
    group.key,
    group.label,
    group.stances.map(stance => stance.outlet),
  ]), [
    ['against', 'Leans against', ['news.com.au', 'The Mercury']],
    ['plain', 'Plain', ['The Guardian AU']],
  ]);
  assert.ok(JSON.stringify(panel).toLowerCase().includes('left') === false);
  assert.ok(JSON.stringify(panel).toLowerCase().includes('right') === false);
});

test('prepareToldPanel marks an outlets-only result as told much the same way', () => {
  const panel = prepareToldPanel({
    outlets: [
      { name: 'ABC', headline: 'Jobless rate rises' },
      { name: 'SBS', headline: 'Unemployment reaches 4.7 per cent' },
    ],
    subjects: [],
    differs: false,
  });
  assert.strictEqual(panel.outletCount, 2);
  assert.deepStrictEqual(panel.subjects, []);
  assert.strictEqual(panel.sameWay, true);
  assert.deepStrictEqual(panel.headlines.map(outlet => outlet.name), ['ABC', 'SBS']);
});

test('balanceColumnHeights computes blank space after contiguous newspaper flow', () => {
  assert.deepStrictEqual(balanceColumnHeights([100, 80, 70, 60], 2), {
    heights: [180, 130],
    blank: [0, 50],
    tallest: 180,
  });
  assert.deepStrictEqual(balanceColumnHeights([100, 100, 100], 5), {
    heights: [100, 100, 100, 0, 0],
    blank: [0, 0, 0, 100, 100],
    tallest: 100,
  });
});
