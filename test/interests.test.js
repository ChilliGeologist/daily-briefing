'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { DEFAULT_INTERESTS, matchInterests, interestScore } = require('../src/pipeline/writer/interests');

it('seeds all interests in the specified order with complete values', () => {
  assert.deepStrictEqual(DEFAULT_INTERESTS.map(({ label, kind, weight, urgent, requires_place }) => ({ label, kind, weight, urgent, requires_place })), [
    { label: 'West Tamar', kind: 'place', weight: 3, urgent: false, requires_place: undefined },
    { label: 'Launceston', kind: 'place', weight: 3, urgent: false, requires_place: undefined },
    { label: 'Northern Tasmania', kind: 'place', weight: 2, urgent: false, requires_place: undefined },
    { label: 'Tasmania', kind: 'place', weight: 1, urgent: false, requires_place: undefined },
    { label: 'Council politics', kind: 'topic', weight: 2, urgent: false, requires_place: true },
    { label: 'State politics', kind: 'topic', weight: 2, urgent: false, requires_place: true },
    { label: 'Federal politics', kind: 'topic', weight: 1, urgent: false, requires_place: undefined },
    { label: 'Emergencies', kind: 'topic', weight: 3, urgent: true, requires_place: true },
    { label: 'Events', kind: 'topic', weight: 1, urgent: false, requires_place: true },
    { label: 'Unraid', kind: 'product', weight: 2, urgent: true, requires_place: undefined },
    { label: 'Plex', kind: 'product', weight: 2, urgent: true, requires_place: undefined },
    { label: 'Sonarr', kind: 'product', weight: 2, urgent: true, requires_place: undefined },
    { label: 'Radarr', kind: 'product', weight: 2, urgent: true, requires_place: undefined },
    { label: 'Home Assistant', kind: 'product', weight: 2, urgent: true, requires_place: undefined },
    { label: 'UniFi', kind: 'product', weight: 2, urgent: true, requires_place: undefined },
    { label: 'Tailscale', kind: 'product', weight: 2, urgent: true, requires_place: undefined },
    { label: 'Authelia', kind: 'product', weight: 2, urgent: true, requires_place: undefined },
    { label: 'Proton', kind: 'product', weight: 2, urgent: true, requires_place: undefined },
    { label: 'Up Bank', kind: 'product', weight: 2, urgent: false, requires_place: undefined },
    { label: 'Aurora Energy', kind: 'product', weight: 2, urgent: false, requires_place: undefined },
    { label: 'Interest rates', kind: 'product', weight: 2, urgent: false, requires_place: undefined },
    { label: 'Woolworths', kind: 'product', weight: 2, urgent: false, requires_place: undefined },
    { label: 'Coles', kind: 'product', weight: 2, urgent: false, requires_place: undefined },
    { label: 'Dota 2', kind: 'product', weight: 2, urgent: false, requires_place: undefined },
    { label: 'Old School RuneScape', kind: 'product', weight: 2, urgent: false, requires_place: undefined },
  ]);
  assert.deepStrictEqual(DEFAULT_INTERESTS.find(({ label }) => label === 'Events'), {
    label: 'Events',
    kind: 'topic',
    terms: ['festival', 'concert', 'exhibition', 'Agfest', 'Festivale', 'Tasmania Devils', 'JackJumpers', 'Launceston Show'],
    weight: 1,
    urgent: false,
    requires_place: true,
  });
});

it('requires a place match for locally scoped topic interests', () => {
  assert.deepStrictEqual(matchInterests('Show HN: SolidCraft', DEFAULT_INTERESTS), []);
  assert.deepStrictEqual(matchInterests('NSW bushfire warning issued near Newcastle', DEFAULT_INTERESTS), []);
  assert.deepStrictEqual(matchInterests('Launceston mayor opens Festivale concert', DEFAULT_INTERESTS), [
    { label: 'Launceston', kind: 'place', weight: 3, urgent: false, term: 'Launceston' },
    { label: 'Council politics', kind: 'topic', weight: 2, urgent: false, term: 'mayor' },
    { label: 'Events', kind: 'topic', weight: 1, urgent: false, term: 'concert' },
  ]);
});

it('counts Tasmanian organisations and "Tas" as Tasmania', () => {
  const tasmania = DEFAULT_INTERESTS.filter(entry => entry.label === 'Tasmania');
  assert.deepStrictEqual(
    matchInterests('‘Cost-efficient’: TasNetworks latest govt business to defend AI ads', tasmania).map(m => m.term),
    ['TasNetworks'],
  );
  assert.deepStrictEqual(matchInterests('Free for Tas residents', tasmania).map(m => m.term), ['Tas']);
  assert.deepStrictEqual(matchInterests('Taser used in arrest', tasmania), []);
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
