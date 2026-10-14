'use strict';

function interest(label, kind, terms, weight, urgent = false, requiresPlace = false) {
  return Object.freeze({
    label,
    kind,
    terms: Object.freeze(terms),
    weight,
    urgent,
    ...(requiresPlace ? { requires_place: true } : {}),
  });
}

const DEFAULT_INTERESTS = Object.freeze([
  interest('West Tamar', 'place', ['West Tamar', 'Beaconsfield', 'Beauty Point', 'Exeter', 'Legana', 'Riverside', 'Grindelwald', 'Tamar Valley'], 3),
  interest('Launceston', 'place', ['Launceston', 'City of Launceston'], 3),
  interest('Northern Tasmania', 'place', ['northern Tasmania', 'north Tasmania', 'Devonport', 'George Town', 'Meander Valley', 'Deloraine'], 2),
  // State bodies that never name the state in a headline count as Tasmanian.
  interest('Tasmania', 'place', [
    'Tasmania', 'Tasmanian', 'Tassie', 'Tas', 'Hobart',
    'TasNetworks', 'TasWater', 'TasRail', 'TasPorts', 'TasTAFE',
  ], 1),
  interest('Council politics', 'topic', ['council', 'mayor', 'councillor'], 2, false, true),
  interest('State politics', 'topic', ['Tasmanian parliament', 'House of Assembly', 'Tasmanian government', 'premier', 'state budget'], 2, false, true),
  interest('Federal politics', 'topic', ['federal parliament', 'prime minister', 'Senate', 'federal budget', 'federal election'], 1),
  interest('Emergencies', 'topic', ['bushfire', 'fire warning', 'flood', 'severe weather', 'evacuate', 'emergency warning', 'road closed', 'road closure'], 3, true, true),
  interest('Events', 'topic', ['festival', 'concert', 'exhibition', 'Agfest', 'Festivale', 'Tasmania Devils', 'JackJumpers', 'Launceston Show'], 1, false, true),
  interest('Unraid', 'product', ['Unraid'], 2, true),
  interest('Plex', 'product', ['Plex'], 2, true),
  interest('Sonarr', 'product', ['Sonarr'], 2, true),
  interest('Radarr', 'product', ['Radarr'], 2, true),
  interest('Home Assistant', 'product', ['Home Assistant'], 2, true),
  interest('UniFi', 'product', ['UniFi', 'Ubiquiti'], 2, true),
  interest('Tailscale', 'product', ['Tailscale'], 2, true),
  interest('Authelia', 'product', ['Authelia'], 2, true),
  // Bare "Proton" also names Valve's game layer for Linux.
  interest('Proton', 'product', ['Proton Drive', 'Proton Mail', 'Proton VPN', 'Proton Pass'], 2, true),
  interest('Up Bank', 'product', ['Up Bank', 'Up banking'], 2),
  interest('Aurora Energy', 'product', ['Aurora Energy', 'electricity price', 'solar feed-in'], 2),
  interest('Interest rates', 'product', ['RBA', 'cash rate', 'interest rate'], 2),
  interest('Woolworths', 'product', ['Woolworths'], 2),
  interest('Coles', 'product', ['Coles'], 2),
  interest('Dota 2', 'product', ['Dota 2', 'Dota'], 2),
  interest('Old School RuneScape', 'product', ['Old School RuneScape', 'OSRS'], 2),
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholeTerm(text, term, caseSensitive = false) {
  const escaped = escapeRegExp(String(term));
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
    caseSensitive ? 'u' : 'iu'
  );
  return pattern.test(text);
}

function matchInterests(text, interests = DEFAULT_INTERESTS) {
  const haystack = typeof text === 'string' ? text : '';
  const candidates = [];

  for (const entry of interests || []) {
    const term = (entry.terms || []).find(candidate =>
      hasWholeTerm(haystack, candidate, entry.kind === 'place')
    );
    if (term === undefined) continue;
    candidates.push({ entry, term });
  }

  const hasPlace = candidates.some(({ entry }) => entry.kind === 'place');
  return candidates
    .filter(({ entry }) => !entry.requires_place || hasPlace)
    .map(({ entry, term }) => ({
      label: entry.label,
      kind: entry.kind,
      weight: entry.weight,
      urgent: Boolean(entry.urgent),
      term,
    }));
}

function interestScore(matches) {
  return (matches || []).reduce((total, match) => total + (Number(match.weight) || 0), 0);
}

module.exports = { DEFAULT_INTERESTS, matchInterests, interestScore, hasWholeTerm };
