'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/stage6-notification-items.json');

let notifications = {};
try { notifications = require('../src/notifications'); } catch (_) { /* pre-change failure */ }

test('selects only urgent product security and near-home emergency candidates', () => {
  assert.deepStrictEqual(notifications.selectAlertCandidates(fixture), [
    {
      item: fixture[0],
      kind: 'security',
      kicker: 'Security',
      matches: [{ label: 'Plex', kind: 'product', weight: 2, urgent: true, term: 'Plex' }],
    },
    {
      item: fixture[1],
      kind: 'emergency',
      kicker: 'Emergency near home',
      matches: [
        { label: 'Launceston', kind: 'place', weight: 3, urgent: false, term: 'Launceston' },
        { label: 'Emergencies', kind: 'topic', weight: 3, urgent: true, term: 'severe weather' },
      ],
    },
  ]);
});

test('lets an urgent custom interest reach the strict alert check', () => {
  const item = { title: 'Aurora forecast changes rooftop solar payments', description: '' };
  assert.deepStrictEqual(notifications.selectAlertCandidates([item], [{
    label: 'Solar changes', kind: 'topic', terms: ['solar'], weight: 2, urgent: true,
  }]), [{
    item,
    kind: 'interest',
    kicker: 'Solar changes',
    matches: [{ label: 'Solar changes', kind: 'topic', weight: 2, urgent: true, term: 'solar' }],
  }]);
});

test('applies quiet hours and the local-day cap as whole decisions', () => {
  const settings = {
    getAlertDailyCap: () => 2,
    getQuietHours: () => ['21:00', '07:00'],
  };
  assert.deepStrictEqual([
    notifications.alertDecision({ time: '20:59', sentCount: 1, kind: 'security' }, settings),
    notifications.alertDecision({ time: '21:00', sentCount: 0, kind: 'security' }, settings),
    notifications.alertDecision({ time: '06:59', sentCount: 0, kind: 'emergency' }, settings),
    notifications.alertDecision({ time: '07:00', sentCount: 2, kind: 'emergency' }, settings),
  ], [
    { allowed: true, reason: null },
    { allowed: false, reason: 'quiet hours' },
    { allowed: true, reason: null },
    { allowed: false, reason: 'daily cap reached' },
  ]);
});

test('builds complete morning, alert and test push payloads', () => {
  assert.deepStrictEqual({
    morning: notifications.buildMorningPayload({
      sections: [
        { id: 'australia', items: [{ title: 'Lead story' }] },
        { id: 'top', title: 'You should know', items: [{ title: 'Top headline' }] },
      ],
    }, 42),
    alert: notifications.buildAlertPayload({ id: 7, kicker: 'Security', headline: 'Patch Plex now' }),
    test: notifications.buildTestPayload(),
  }, {
    morning: {
      title: 'The Daily Gump is ready',
      body: 'Top headline',
      url: '/?edition=42',
      tag: 'morning-edition-42',
    },
    alert: {
      title: 'Security',
      body: 'Patch Plex now',
      url: '/?alert=7',
      tag: 'urgent-alert-7',
    },
    test: {
      title: 'Notifications are working',
      body: 'The Daily Gump can reach you.',
      url: '/',
      tag: 'notification-test',
    },
  });
});

test('parses only a strict JSON verdict with a one-line reason', () => {
  assert.deepStrictEqual([
    notifications.parseAlertVerdict('{"urgent":true,"reason":"Patch exposed Plex servers now."}'),
    notifications.parseAlertVerdict('```json\n{"urgent":false,"reason":"This can wait until morning."}\n```'),
    notifications.parseAlertVerdict('{"urgent":"yes","reason":"Wrong type"}'),
    notifications.parseAlertVerdict('{"urgent":true,"reason":"first line\\nsecond line"}'),
  ], [
    { urgent: true, reason: 'Patch exposed Plex servers now.' },
    { urgent: false, reason: 'This can wait until morning.' },
    null,
    null,
  ]);
});
