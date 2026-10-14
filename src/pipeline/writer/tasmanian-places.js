'use strict';

const GAZETTEER_NAMES = [
  // Cities, towns and settlements: north west and west coast.
  'Stanley', 'Smithton', 'Wynyard', 'Burnie', 'Somerset', 'Penguin', 'Ulverstone',
  'Devonport', 'Latrobe', 'Shearwater', 'Port Sorell', 'Hawley Beach', 'Spreyton',
  'Turners Beach', 'Forth', 'Railton', 'Sheffield', 'Mole Creek', 'Tullah', 'Waratah',
  'Strahan', 'Zeehan', 'Rosebery', 'Savage River', 'Corinna', 'Arthur River', 'Marrawah',
  'Boat Harbour', 'Sisters Beach', 'Ridgley', 'Yolla', 'Gawler', 'Riana', 'Gunns Plains',
  'Cradle Valley', 'Moina', 'Wilmot',

  // Launceston, Tamar and the northern midlands.
  'Launceston', 'Deloraine', 'Westbury', 'Longford', 'Evandale', 'Campbell Town',
  'Ross', 'Oatlands', 'Bothwell', 'Hamilton', 'Hadspen', 'Carrick', 'Bracknell',
  'Cressy', 'Bishopsbourne', 'Hagley', 'Whitemore', 'Poatina', 'Liffey', 'Miena',
  'Great Lake', 'George Town', 'Low Head', 'Beaconsfield', 'Beauty Point', 'Legana',
  'Grindelwald', 'Lilydale', 'Rocherlea', 'Invermay', 'Mowbray', 'Newnham',
  'Kings Meadows', 'Prospect Vale', 'Prospect', 'Summerhill', 'Trevallyn', 'Riverside',
  'Youngtown', 'Norwood', 'Newstead', 'East Launceston', 'West Launceston', 'Mayfield',
  'Ravenswood', 'Waverley', 'St Leonards', 'Dilston', 'Windermere', 'Rowella',
  'Kayena', 'Deviot', 'Sidmouth', 'Glengarry', 'Frankford', 'Sassafras',

  // North east and east coast.
  'Scottsdale', 'Bridport', 'Derby', 'Ringarooma', 'Weldborough', 'Gladstone',
  'St Helens', 'St Marys', 'Fingal', 'Avoca', 'Mathinna', 'Pyengana', 'Binalong Bay',
  'Falmouth', 'Scamander', 'Four Mile Creek', 'Bicheno', 'Coles Bay', 'Triabunna',
  'Orford', 'Spring Beach', 'Buckland', 'Little Swanport', 'Dolphin Sands',

  // Hobart, Derwent and south east.
  'Hobart', 'Glenorchy', 'Moonah', 'New Town', 'Lenah Valley', 'West Hobart',
  'North Hobart', 'South Hobart', 'Mount Stuart', 'Sandy Bay', 'Battery Point',
  'Dynnyrne', 'Taroona', 'Bonnet Hill', 'Kingston', 'Kingston Beach', 'Blackmans Bay',
  'Howden', 'Huntingfield', 'Claremont', 'Berriedale', 'Austins Ferry', 'Granton',
  'Bridgewater', 'Gagebrook', 'Old Beach', 'Otago', 'Risdon Vale', 'Lindisfarne',
  'Geilston Bay', 'Rose Bay', 'Montagu Bay', 'Bellerive', 'Rosny', 'Rosny Park',
  'Warrane', 'Mornington', 'Howrah', 'Tranmere', 'Rokeby', 'Clarendon Vale',
  'Lauderdale', 'Seven Mile Beach', 'Cambridge', 'Sorell', 'Midway Point', 'Dodges Ferry',
  'Dunalley', 'Murdunna', 'Eaglehawk Neck', 'Nubeena', 'Port Arthur', 'Koonya',
  'Premaydena', 'Saltwater River', 'Kempton', 'Bagdad', 'Pontville', 'Tea Tree',
  'Dromedary', 'New Norfolk', 'Boyer', 'Magra', 'Bushy Park', 'Westerway', 'Maydena',
  'Ellendale', 'Ouse', 'Tarraleah', 'Derwent Bridge',

  // Huon, Channel and far south.
  'Huonville', 'Cygnet', 'Geeveston', 'Dover', 'Franklin', 'Ranelagh', 'Judbury',
  'Glen Huon', 'Pelverata', 'Cradoc', 'Nicholls Rivulet', 'Woodbridge', 'Kettering',
  'Snug', 'Coningham', 'Electrona', 'Kaoota', 'Sandfly', 'Longley', 'Leslie Vale',
  'Mountain River', 'Lucaston', 'Castle Forbes Bay', 'Port Huon', 'Southport',
  'Ida Bay', 'Lune River', 'Cockle Creek', 'Adventure Bay', 'Alonnah', 'Lunawanna',

  // Bass Strait islands.
  'Currie', 'Grassy', 'Naracoopa', 'Whitemark', 'Lady Barron', 'Emita', 'Killiecrankie',
  'Cape Barren Island',

  // Regions and islands.
  'King Island', 'Flinders Island', 'Bruny Island', 'Tasman Island', 'Maria Island',
  'Tasman Peninsula', 'Huon Valley', 'Derwent Valley', 'Meander Valley',
  'Central Highlands', 'East Coast', 'North West Coast', 'West Coast', 'Midlands',
  'Northern Midlands', 'Southern Midlands', 'Tamar Valley', 'West Tamar',
  'Furneaux Group', 'Bass Strait islands',

  // Landmarks and natural features.
  'The Nut', 'Cradle Mountain', 'Lake St Clair', 'Freycinet', 'Wineglass Bay',
  'kunanyi', 'Mount Wellington', 'Cataract Gorge', 'Bay of Fires', 'Mount Field',
  'Russell Falls', 'Gordon River', 'Franklin River', 'Ben Lomond', 'Tamar River',
  'Derwent River', 'Salamanca', 'MONA', 'Port Arthur Historic Site', 'Overland Track',
  'Three Capes Track', 'Walls of Jerusalem', 'Frenchmans Cap', 'Mount Roland',
  'Table Cape', 'Cape Grim', 'Rocky Cape', 'Lake Pedder', 'Lake Gordon', 'Lake King William',
  'Great Western Tiers', 'South West Cape', 'Tasman Arch', 'Devils Kitchen',
  'Tessellated Pavement', 'Hartz Mountains', 'Tahune AirWalk', 'Hastings Caves',
  'Mole Creek Caves', 'Marakoopa Cave', 'Leven Canyon', 'Dial Range', 'Nut State Reserve',
];

// A name belongs here when it is also a common word or surname, or a recognised
// mainland Australian, New Zealand or UK place. It counts only alongside clear
// Tasmanian evidence in the same story. Burnie remains unambiguous: unlike the
// names below, its primary Australian place association is the Tasmanian city.
const NEEDS_COMPANION = Object.freeze([
  'Perth', 'Richmond', 'Brighton', 'Swansea', 'Queenstown', 'Exeter', 'Margate',
  'Hamilton', 'Sheffield', 'Longford', 'Dover', 'Wynyard', 'Claremont', 'Westbury',
  'Latrobe', 'Lilydale', 'Waratah', 'Bridgewater', 'Beaconsfield', 'Newnham',
  'Mowbray', 'Ross', 'Penguin', 'Somerset', 'Fingal', 'Kingston', 'Prospect',
  'Forth', 'Riverside', 'Lindisfarne', 'New Town', 'Sandford', 'Cambridge',
  'Franklin', 'Lauderdale', 'Orford', 'Avoca', 'Bothwell', 'Stanley', 'Scottsdale',
]);

const TASMANIAN_COMPANIONS = Object.freeze([
  'Tasmania', 'Tasmanian', 'Tassie', 'Tas', 'Hobart', 'Launceston',
  'TasNetworks', 'TasWater', 'TasRail', 'TasPorts', 'TasTAFE',
]);

const needsCompanionSet = new Set(NEEDS_COMPANION);
const UNAMBIGUOUS = Object.freeze(GAZETTEER_NAMES.filter(name => !needsCompanionSet.has(name)));
const TASMANIAN_PLACES = Object.freeze([...UNAMBIGUOUS, ...NEEDS_COMPANION]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholePlace(text, name) {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, 'u');
  return pattern.test(text);
}

function unique(values) {
  return [...new Set(values)];
}

function matchTasmanianPlaces(text, additionalTerms = []) {
  const haystack = typeof text === 'string' ? text : '';
  const extra = unique((additionalTerms || []).map(String));
  const unambiguous = unique([
    ...UNAMBIGUOUS.filter(name => hasWholePlace(haystack, name)),
    ...extra.filter(name => !needsCompanionSet.has(name) && hasWholePlace(haystack, name)),
  ]);
  const ambiguous = unique([
    ...NEEDS_COMPANION.filter(name => hasWholePlace(haystack, name)),
    ...extra.filter(name => needsCompanionSet.has(name) && hasWholePlace(haystack, name)),
  ]);
  const companions = TASMANIAN_COMPANIONS.filter(name => hasWholePlace(haystack, name));
  const hasCompanion = unambiguous.length > 0 || companions.length > 0;

  return {
    unambiguous,
    needsCompanion: hasCompanion ? ambiguous : [],
    rejected: hasCompanion ? [] : ambiguous,
    companions,
  };
}

module.exports = {
  NEEDS_COMPANION,
  TASMANIAN_COMPANIONS,
  TASMANIAN_PLACES,
  UNAMBIGUOUS,
  matchTasmanianPlaces,
};
