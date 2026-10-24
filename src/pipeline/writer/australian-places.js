'use strict';

const { FOREIGN_COUNTRIES, FOREIGN_CITIES } = require('./foreign-places');

const AUSTRALIAN_PLACES = [
  'New South Wales', 'Victoria', 'Queensland', 'South Australia', 'Western Australia',
  'Northern Territory', 'Australian Capital Territory', 'Tasmania',
  'NSW', 'Vic', 'VIC', 'Qld', 'QLD', 'SA', 'WA', 'NT', 'ACT', 'Tas', 'TAS',
  'Sydney', 'Melbourne', 'Brisbane', 'Adelaide', 'Canberra', 'Hobart', 'Launceston',
  'Alice Springs', 'Gold Coast', 'Sunshine Coast', 'Wollongong', 'Geelong',
  'Cairns', 'Townsville', 'Toowoomba', 'Ballarat', 'Bendigo', 'Bundaberg',
];
const SHARED_AUSTRALIAN_PLACES = ['Perth', 'Newcastle', 'Richmond', 'Darwin'];

function wholeNames(names) {
  const alternatives = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Case-sensitive Unicode boundaries: SA/WA cannot match Sa, was or other words.
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'u');
}

const australian = wholeNames(AUSTRALIAN_PLACES);
const newSouthWales = new RegExp(wholeNames(['New South Wales']).source, 'gu');
const shared = wholeNames(SHARED_AUSTRALIAN_PLACES);
const companion = wholeNames(['Australia', 'Australian']);
const overseas = wholeNames([
  ...FOREIGN_COUNTRIES.flatMap(entry => entry.split('|').flatMap(name => [name, `${name}s`])),
  ...FOREIGN_CITIES,
]);

const club = wholeNames([
  'Manchester City', 'Man City', 'Manchester United', 'Liverpool FC', 'Arsenal',
  'Chelsea', 'Tottenham', 'Real Madrid', 'Barcelona', 'Bayern Munich',
  'Paris Saint-Germain', 'PSG', 'Juventus', 'Inter Milan', 'AC Milan',
]);
const football = /\b(?:football|soccer|Premier League|EPL)\b/i;
const unqualifiedUnited = wholeNames(['United']);
const entertainment = /\b(?:actor|actress|band|celebrity|cinema|comedian|concert|film|frontman|music|musician|singer|television|tour)\b/i;
const barePlaces = new Set([
  ...AUSTRALIAN_PLACES,
  ...SHARED_AUSTRALIAN_PLACES,
  'Australia', 'Australian',
  ...FOREIGN_COUNTRIES.flatMap(entry => entry.split('|')),
  ...FOREIGN_CITIES,
].map(name => name.toLocaleLowerCase('en-AU')));

function hasAustralianOnlyPlace(headline, summary, ...additionalEvidence) {
  const placeText = [headline, summary, ...additionalEvidence]
    .filter(value => typeof value === 'string').join('\n');
  const overseasText = [headline, summary].filter(value => typeof value === 'string').join('\n');
  // Real candidates include both Newcastle Knights and "Coventry crush Newcastle".
  // Require independent Australian evidence for shared names, including Darwin
  // (also a surname). A publisher's location never provides that evidence.
  return (australian.test(placeText) || (shared.test(placeText) && companion.test(placeText)))
    // Wales inside New South Wales is not overseas evidence.
    && !overseas.test(overseasText.replace(newSouthWales, ' '));
}

function hasAnyAustralianEvidence(text) {
  return australian.test(text) || companion.test(text)
    || (shared.test(text) && companion.test(text));
}

function hasOverseasOnlyEvidence(...values) {
  const text = values.filter(value => typeof value === 'string' && value.trim()).join('\n');
  if (!text || hasAnyAustralianEvidence(text)) return false;
  if (club.test(text) || (unqualifiedUnited.test(text) && football.test(text))) return true;
  return entertainment.test(text) && overseas.test(text.replace(newSouthWales, ' '));
}

function isBarePlaceName(value) {
  return barePlaces.has(String(value || '').trim().toLocaleLowerCase('en-AU'));
}

module.exports = {
  AUSTRALIAN_PLACES,
  SHARED_AUSTRALIAN_PLACES,
  hasAnyAustralianEvidence,
  hasAustralianOnlyPlace,
  hasOverseasOnlyEvidence,
  isBarePlaceName,
};
