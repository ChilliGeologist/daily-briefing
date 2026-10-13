'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { DEFAULT_INTERESTS, matchInterests, interestScore } = require('../src/pipeline/writer/interests');

it('seeds all interests in the specified order with complete values', () => {
  assert.deepStrictEqual(DEFAULT_INTERESTS.map(({ label, kind, weight, urgent }) => ({ label, kind, weight, urgent })), [
    { label: 'West Tamar', kind: 'place', weight: 3, urgent: false },
    { label: 'Launceston', kind: 'place', weight: 3, urgent: false },
    { label: 'Northern Tasmania', kind: 'place', weight: 2, urgent: false },
    { label: 'Tasmania', kind: 'place', weight: 1, urgent: false },
    { label: 'Council politics', kind: 'topic', weight: 2, urgent: false },
    { label: 'State politics', kind: 'topic', weight: 2, urgent: false },
    { label: 'Federal politics', kind: 'topic', weight: 1, urgent: false },
    { label: 'Emergencies', kind: 'topic', weight: 3, urgent: true },
    { label: 'Events', kind: 'topic', weight: 1, urgent: false },
    { label: 'Unraid', kind: 'product', weight: 2, urgent: true },
    { label: 'Plex', kind: 'product', weight: 2, urgent: true },
    { label: 'Sonarr', kind: 'product', weight: 2, urgent: true },
    { label: 'Radarr', kind: 'product', weight: 2, urgent: true },
    { label: 'Home Assistant', kind: 'product', weight: 2, urgent: true },
    { label: 'UniFi', kind: 'product', weight: 2, urgent: true },
    { label: 'Tailscale', kind: 'product', weight: 2, urgent: true },
    { label: 'Authelia', kind: 'product', weight: 2, urgent: true },
    { label: 'Proton', kind: 'product', weight: 2, urgent: true },
    { label: 'Up Bank', kind: 'product', weight: 2, urgent: false },
    { label: 'Aurora Energy', kind: 'product', weight: 2, urgent: false },
    { label: 'Interest rates', kind: 'product', weight: 2, urgent: false },
    { label: 'Woolworths', kind: 'product', weight: 2, urgent: false },
    { label: 'Coles', kind: 'product', weight: 2, urgent: false },
    { label: 'Dota 2', kind: 'product', weight: 2, urgent: false },
    { label: 'Old School RuneScape', kind: 'product', weight: 2, urgent: false },
  ]);
});

it('matches whole words and phrases case-insensitively once per interest', () => {
  const interests = [
    { label: 'Shop', kind: 'product', terms: ['Coles', 'Coles Online'], weight: 2, urgent: false },
    { label: 'Game', kind: 'product', terms: ['Dota', 'Dota 2'], weight: 3, urgent: true },
  ];
  assert.deepStrictEqual(matchInterests('NIColes ignored; COLES and dota are named, anecdotal is not.', interests), [
    { label: 'Shop', kind: 'product', weight: 2, urgent: false, term: 'Coles' },
    { label: 'Game', kind: 'product', weight: 3, urgent: true, term: 'Dota' },
  ]);
  assert.deepStrictEqual(matchInterests('Nicoles and anecdotal', interests), []);
});

it('adds the weights of matched interests', () => {
  assert.strictEqual(interestScore([
    { weight: 3 },
    { weight: 2 },
    { weight: 1 },
  ]), 6);
});
