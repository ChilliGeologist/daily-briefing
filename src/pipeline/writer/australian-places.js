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

function wholeNames(names) {
  const alternatives = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Case-sensitive Unicode boundaries: SA/WA cannot match Sa, was or other words.
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'u');
}

const australian = wholeNames(AUSTRALIAN_PLACES);
const newSouthWales = new RegExp(wholeNames(['New South Wales']).source, 'gu');
const shared = wholeNames(['Perth', 'Newcastle', 'Richmond', 'Darwin']);
const companion = wholeNames(['Australia', 'Australian']);
const overseas = wholeNames([
  ...FOREIGN_COUNTRIES.flatMap(entry => entry.split('|').flatMap(name => [name, `${name}s`])),
  ...FOREIGN_CITIES,
]);

function hasAustralianOnlyPlace(headline, summary) {
  const text = [headline, summary].filter(value => typeof value === 'string').join('\n');
  // Real candidates include both Newcastle Knights and "Coventry crush Newcastle".
  // Require independent Australian evidence for shared names, including Darwin
  // (also a surname). A publisher's location never provides that evidence.
  return (australian.test(text) || (shared.test(text) && companion.test(text)))
    // Wales inside New South Wales is not overseas evidence.
    && !overseas.test(text.replace(newSouthWales, ' '));
}

module.exports = { hasAustralianOnlyPlace };
