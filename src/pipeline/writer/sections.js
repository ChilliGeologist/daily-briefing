'use strict';

const SECTIONS = Object.freeze([
  Object.freeze({ id: 'tasmania', title: 'Tasmania' }),
  Object.freeze({ id: 'australia', title: 'Australia' }),
  Object.freeze({ id: 'world', title: 'World' }),
  Object.freeze({ id: 'tech', title: 'Tech & Security' }),
  Object.freeze({ id: 'homelab', title: 'Homelab & Self-hosting' }),
  Object.freeze({ id: 'gaming', title: 'Gaming' }),
  Object.freeze({ id: 'internet', title: 'Around the internet' }),
]);

const TOP_SECTION = Object.freeze({ id: 'top', title: 'You should know' });
const SECTION_IDS = new Set(SECTIONS.map(section => section.id));

// Fallback classification is deliberately data-driven so adding another
// product or interest does not add product-specific branches to validation.
const SECTION_BY_INTEREST_KIND = Object.freeze({ place: 'tasmania' });
const SECTION_BY_INTEREST_LABEL = Object.freeze({
  Unraid: 'homelab',
  Plex: 'homelab',
  Sonarr: 'homelab',
  Radarr: 'homelab',
  'Home Assistant': 'homelab',
  UniFi: 'homelab',
  Tailscale: 'homelab',
  Authelia: 'homelab',
  Proton: 'homelab',
  'Dota 2': 'gaming',
  'Old School RuneScape': 'gaming',
});

const SECTION_REQUIRES_PLACE = Object.freeze({
  tasmania: Object.freeze({ kinds: Object.freeze(['place']), fallback: 'australia', placeName: 'Tasmanian' }),
});

// A source whose whole feed is one topic (a game's subreddit, a gaming news
// site, r/homelab) never lands in a news section, whatever the writer chose.
const SECTION_BY_SOURCE_CATEGORY = Object.freeze({ gaming: 'gaming', homelab: 'homelab' });
// An internet-culture feed's story stays in Around the internet unless other
// outlets carried it too (then it is news, e.g. a Lifeblood appeal that
// r/popular also posted).
const SECTION_BY_SINGLE_SOURCE_CATEGORY = Object.freeze({ trending: 'internet' });

function isSectionId(id) {
  return SECTION_IDS.has(id);
}

module.exports = {
  SECTIONS,
  TOP_SECTION,
  SECTION_BY_INTEREST_KIND,
  SECTION_BY_INTEREST_LABEL,
  SECTION_BY_SOURCE_CATEGORY,
  SECTION_BY_SINGLE_SOURCE_CATEGORY,
  SECTION_REQUIRES_PLACE,
  isSectionId,
};
