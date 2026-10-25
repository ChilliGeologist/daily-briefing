'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const scheduler = require('../src/scheduler');

test('client tracking and the weekly job use the complete stage 7 boundaries', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const showReader = source.slice(source.indexOf('function showReader('), source.indexOf('function openReaderById('));
  const seenObserver = source.slice(source.indexOf('function startStorySeenObserver('), source.indexOf('function stopReaderReadTracking('));
  const alertLoader = source.slice(source.indexOf('async function loadAlert('), source.indexOf('function renderReadingBand('));

  assert.deepStrictEqual({
    weekly_cron: scheduler.LEARNING_CRON,
    flush_ms: Number(source.match(/setInterval\(function\(\) \{ flushStoryEvents\(false\); \}, (\d+)\)/)[1]),
    seen_ms: Number(seenObserver.match(/\}, (\d+)\)\);/)[1]),
    seen_ratio: Number(seenObserver.match(/threshold: \[([\d.]+)\]/)[1]),
    read_full_ms: Number(source.match(/\}, (\d+)\);\n\}/g).map(value => Number(value.match(/\d+/)[0])).find(value => value === 45000)),
    reader_records_open: showReader.includes("queueStoryEvent('opened', key);"),
    reader_starts_full_read: showReader.includes('startReaderReadTracking(key);'),
    seen_latest_only: seenObserver.includes('if (!currentBriefingIsLatest || !currentBriefingId'),
    alert_is_not_indexed: alertLoader.includes('readingStories.clear();') && alertLoader.includes("showReader({"),
    unload_flushes: source.includes("window.addEventListener('pagehide', function() { flushStoryEvents(true); });"),
  }, {
    weekly_cron: '30 3 * * 0',
    flush_ms: 20000,
    seen_ms: 1000,
    seen_ratio: 0.5,
    read_full_ms: 45000,
    reader_records_open: true,
    reader_starts_full_read: true,
    seen_latest_only: true,
    alert_is_not_indexed: true,
    unload_flushes: true,
  });
});

test('status panel keeps the specified short controls and empty state', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.deepStrictEqual([
    'What the paper has learned',
    'Nothing yet. Read a few more papers and check back.',
    'Work it out now',
    'Forget all this',
    'You open Gaming stories more than most: nudged up a little.',
    'You rarely open stories from Daily Telegraph: nudged down.',
  ].map(text => source.includes(text)), [true, true, true, true, false, false]);

  const sentenceSource = source.slice(source.indexOf('function learningSentence('), source.indexOf('function learningTime('));
  const learningSentence = Function('nudge', `${sentenceSource}; return learningSentence(nudge);`);
  assert.deepStrictEqual([
    learningSentence({ feature_type: 'kicker', display_value: 'gaming', nudge: 0.15 }),
    learningSentence({ feature_type: 'outlet', display_value: 'Daily Telegraph', nudge: -0.15 }),
  ], [
    'You open Gaming stories more than most: nudged up a little.',
    'You rarely open stories from Daily Telegraph: nudged down.',
  ]);
});
