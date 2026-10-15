'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let logic = {};
try { logic = require('../public/reading-logic'); } catch (_) { /* red run: module not built yet */ }

const { prepareSections, prepareReaderContent, decideGesture, settleGesture } = logic;

function story(id, title) {
  const item = { title };
  if (id !== undefined) item.id = id;
  return item;
}

test('prepareSections puts top first and leaves a four-item section fully shown', () => {
  const tasmania = {
    id: 'tasmania',
    title: 'Tasmania',
    items: [story('t1', 'One'), story('t2', 'Two'), story('t3', 'Three'), story('t4', 'Four')],
    more: []
  };
  const top = {
    id: 'top',
    title: 'You should know',
    items: [story('lead', 'Lead')],
    more: []
  };

  assert.deepStrictEqual(prepareSections([tasmania, top]), [
    { section: top, shown: top.items, hidden: [] },
    { section: tasmania, shown: tasmania.items, hidden: [] }
  ]);
});

test('prepareSections shows every ordinary story with more appended in order', () => {
  const items = Array.from({ length: 7 }, (_, index) => story('s' + (index + 1), 'Story ' + (index + 1)));
  const section = { id: 'world', title: 'World', items, more: [story('s8', 'Story 8'), story('s9', 'Story 9')] };

  assert.deepStrictEqual(prepareSections([section]), [{
    section,
    shown: items.concat(section.more),
    hidden: []
  }]);
});

test('prepareSections ignores the old visible-limit argument and shows the complete section', () => {
  const items = Array.from({ length: 7 }, (_, index) => story('s' + index, 'Story ' + index));
  const more = [story('later', 'Later story')];
  const section = { id: 'tech', title: 'Tech & Security', items, more };

  assert.deepStrictEqual(prepareSections([section], 4), [{ section, shown: items.concat(more), hidden: [] }]);
});

test('prepareSections shows top items and its pre-existing more list together', () => {
  const items = Array.from({ length: 7 }, (_, index) => story('top-' + index, 'Lead ' + index));
  const more = [story('top-more', 'Later lead')];
  const section = { id: 'top', title: 'You should know', items, more };

  assert.deepStrictEqual(prepareSections([section]), [{ section, shown: items.concat(more), hidden: [] }]);
});

test('prepareSections recognises a legacy no-id You should know section as top', () => {
  const topic = { title: 'World', items: [story('world', 'World story')], more: [] };
  const items = Array.from({ length: 6 }, (_, index) => story('lead-' + index, 'Lead ' + index));
  const legacyTop = { title: 'You should know', items, more: [] };

  assert.deepStrictEqual(prepareSections([topic, legacyTop]), [
    { section: legacyTop, shown: items, hidden: [] },
    { section: topic, shown: topic.items, hidden: [] }
  ]);
});

test('prepareSections removes duplicate ids by first occurrence and retains id-less stories', () => {
  const first = story('same', 'First');
  const duplicate = story('same', 'Duplicate');
  const legacyOne = story(undefined, 'Legacy one');
  const legacyTwo = story(undefined, 'Legacy two');
  const final = story('last', 'Last');
  const section = {
    id: 'internet',
    title: 'Around the internet',
    items: [first, legacyOne, duplicate],
    more: [duplicate, legacyTwo, final]
  };

  assert.deepStrictEqual(prepareSections([section], 2), [{
    section,
    shown: [first, legacyOne, legacyTwo, final],
    hidden: []
  }]);
});

test('prepareSections does not mutate the payload or its arrays', () => {
  const input = [{
    id: 'gaming',
    title: 'Gaming',
    items: [story('g1', 'One'), story('g1', 'Duplicate'), story('g2', 'Two')],
    more: [story('g3', 'Three')]
  }];
  const snapshot = structuredClone(input);

  prepareSections(input, 1);

  assert.deepStrictEqual(input, snapshot);
});

test('prepareReaderContent uses the summary without an article and keeps community text plain', () => {
  assert.deepStrictEqual(prepareReaderContent({
    detail: 'The fuller detail shown after the tap.',
    summary: 'Short summary.',
    description: '  The post text.  ',
    top_comments: [' First reply. ', '', null, 'Second reply.'],
  }, false), {
    fallback: 'Short summary.',
    post: 'The post text.',
    replies: ['First reply.', 'Second reply.'],
  });
});

test('prepareReaderContent falls back to summary and omits article fallback when a body exists', () => {
  assert.deepStrictEqual([
    prepareReaderContent({ summary: 'Short summary.' }, false),
    prepareReaderContent({ detail: 'Detail.', summary: 'Summary.' }, true),
  ], [
    { fallback: 'Short summary.', post: '', replies: [] },
    { fallback: '', post: '', replies: [] },
  ]);
});

test('prepareReaderContent ignores detail from an old stored edition', () => {
  assert.deepStrictEqual(prepareReaderContent({
    summary: 'The current reader fallback.',
    detail: 'Legacy expansion copy must not render.',
  }, false), {
    fallback: 'The current reader fallback.',
    post: '',
    replies: [],
  });
});

test('decideGesture waits below 8 px and locks at exactly 8 px', () => {
  assert.strictEqual(decideGesture({ dx: -7.99, dy: 0, side: 'briefing', startedOnStory: true }), 'wait');
  assert.strictEqual(decideGesture({ dx: -8, dy: 0, side: 'briefing', startedOnStory: true }), 'forward');
  assert.strictEqual(decideGesture({ dx: -8.01, dy: 0, side: 'briefing', startedOnStory: true }), 'forward');
  assert.strictEqual(decideGesture({ dx: 7.99, dy: 0, side: 'reader', startedOnStory: false }), 'wait');
  assert.strictEqual(decideGesture({ dx: 8, dy: 0, side: 'reader', startedOnStory: false }), 'back');
  assert.strictEqual(decideGesture({ dx: 8.01, dy: 0, side: 'reader', startedOnStory: false }), 'back');
});

test('decideGesture releases vertical-first movement and treats a tie as horizontal', () => {
  assert.strictEqual(decideGesture({ dx: -8, dy: 8.01, side: 'briefing', startedOnStory: true }), 'vertical');
  assert.strictEqual(decideGesture({ dx: -8, dy: 8, side: 'briefing', startedOnStory: true }), 'forward');
  assert.strictEqual(decideGesture({ dx: 0, dy: 8, side: 'reader', startedOnStory: false }), 'vertical');
});

test('decideGesture ignores wrong directions and briefing drags outside a story', () => {
  assert.strictEqual(decideGesture({ dx: 8, dy: 0, side: 'briefing', startedOnStory: true }), 'ignore');
  assert.strictEqual(decideGesture({ dx: -8, dy: 0, side: 'reader', startedOnStory: true }), 'ignore');
  assert.strictEqual(decideGesture({ dx: -8, dy: 0, side: 'briefing', startedOnStory: false }), 'ignore');
  assert.strictEqual(decideGesture({ dx: 8, dy: 0, side: 'unknown', startedOnStory: true }), 'ignore');
});

test('decideGesture applies a supplied threshold at its exact boundary', () => {
  assert.strictEqual(decideGesture({ dx: -11.99, dy: 0, side: 'briefing', startedOnStory: true, threshold: 12 }), 'wait');
  assert.strictEqual(decideGesture({ dx: -12, dy: 0, side: 'briefing', startedOnStory: true, threshold: 12 }), 'forward');
  assert.strictEqual(decideGesture({ dx: -12.01, dy: 0, side: 'briefing', startedOnStory: true, threshold: 12 }), 'forward');
});

test('settleGesture uses strict forward distance and flick thresholds', () => {
  assert.strictEqual(settleGesture({ direction: 'forward', progress: 0.33, velocityX: -0.5 }), 0);
  assert.strictEqual(settleGesture({ direction: 'forward', progress: 0.330001, velocityX: -0.5 }), 1);
  assert.strictEqual(settleGesture({ direction: 'forward', progress: 0.2, velocityX: -0.500001 }), 1);
  assert.strictEqual(settleGesture({ direction: 'forward', progress: 0.9, velocityX: 0 }), 1);
});

test('settleGesture uses strict back distance and flick thresholds', () => {
  assert.strictEqual(settleGesture({ direction: 'back', progress: 0.67, velocityX: 0.5 }), 1);
  assert.strictEqual(settleGesture({ direction: 'back', progress: 0.669999, velocityX: 0.5 }), 0);
  assert.strictEqual(settleGesture({ direction: 'back', progress: 0.9, velocityX: 0.500001 }), 0);
  assert.strictEqual(settleGesture({ direction: 'back', progress: 0.2, velocityX: 0 }), 0);
});

test('settleGesture clamps progress before deciding', () => {
  assert.strictEqual(settleGesture({ direction: 'forward', progress: -4, velocityX: 0 }), 0);
  assert.strictEqual(settleGesture({ direction: 'forward', progress: 4, velocityX: 0 }), 1);
  assert.strictEqual(settleGesture({ direction: 'back', progress: -4, velocityX: 0 }), 0);
  assert.strictEqual(settleGesture({ direction: 'back', progress: 4, velocityX: 0 }), 1);
});
