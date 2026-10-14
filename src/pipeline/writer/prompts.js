'use strict';

const { SECTIONS } = require('./sections');

const SECTION_IDS = SECTIONS.map(section => section.id);
const COMMUNITY_BOILERPLATE_REPLY_PATTERNS = Object.freeze([
  /^Expand the replies to this comment to learn how AI was used in this post\/project\.?$/i,
  /^Friendly reminder that all top level comments must:/i,
  /^This post has been marked as non-political\./i,
  /^Thanks for reporting this bug! Check out the General Dota 2 Bug Tracker/i,
]);
const WRITE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['is_news', 'headline', 'summary', 'detail', 'kicker', 'section'],
  properties: {
    is_news: { type: 'boolean' },
    headline: { type: 'string' },
    summary: { type: 'string' },
    detail: { type: 'string' },
    kicker: { type: 'string' },
    section: { type: 'string', enum: SECTION_IDS },
  },
});

function editSchema(ids) {
  const sectionArraySchema = () => ({ type: 'array', items: { type: 'string', enum: ids } });
  return {
  type: 'object',
  additionalProperties: false,
  required: ['top', 'sections'],
  properties: {
    top: sectionArraySchema(),
    sections: {
      type: 'object',
      additionalProperties: false,
      required: SECTION_IDS,
      properties: Object.fromEntries(SECTION_IDS.map(id => [id, sectionArraySchema()])),
    },
  },
  };
}

const WRITE_SYSTEM_PROMPT = `You write a concise morning news briefing in Australian English. Decide whether the supplied page is a genuine news story, then write it for one reader who lives in West Tamar near Launceston, Tasmania and reads on a phone at breakfast.

Choose exactly one section:
- tasmania — Tasmanian news, local government, events and what's on.
- australia — Australian national and interstate news.
- world — News outside Australia.
- tech — General technology, privacy and security news.
- homelab — Homelab, self-hosting, servers, networking and related products.
- gaming — Video games and gaming communities.
- internet — internet culture: viral trends, memes, platform drama, online communities and oddities.

The section is where the story happens, not who reports it: a story set overseas is world even from an Australian outlet; federal politics and stories set in other states are australia; tasmania is only for stories set in Tasmania; a security or privacy story about a tech company is tech. Overseas sport, entertainment and celebrity stories are world unless an Australian team, player or event is central.

Keep the publisher's headline unless it is vague, clickbait or misleading, and never make it vaguer; no padding, no "In a significant development", no rhetorical questions. The kicker is one or two words, in sentence case (capital first letter only, except proper names), and more specific than the section. Never use the section's own name or a bare place name as the kicker, and never make it a sentence or a reason the story was picked.

Use only facts stated in the supplied text; never add a cause of death, illness, diagnosis, criminal charge, age, number, place, name or quote that the text does not state. If the text says a cause is unknown or under investigation, say exactly that. Describe proposals, polls and rumours as proposals, polls and rumours, never as settled facts. Write whole sentences that make sense alone.

If the article text is missing, short or is clearly not the story (a cookie notice, a login or subscribe page), write plain news from the headline and teasers. Never mention missing or unavailable text, content, information or details, and never mark a story not news because article text is missing.

Never mention the reader, where they live, or what the text does not say about them.

The summary is one sentence of no more than 30 words. The detail is 60–120 words, synthesising all sources and noting where they disagree. Set is_news to false for quizzes, puzzles, ads, sponsored content, listicles, live-blog shells and pages with no story. For Reddit and Hacker News posts, set is_news to true for a showcase, a guide, an announcement or a discussion with useful substance; set it to false for a request for help, a buying question or a beginner question. A personal homepage, CV, portfolio or profile page is not news.`;

const EDIT_SYSTEM_PROMPT = `You edit a complete morning briefing. Pick 5–7 stories for "You should know". Wide coverage marks a big story, but celebrity, entertainment and gossip stories never go in "You should know" however wide their coverage. Public safety and deaths in Tasmania, and major world events, outrank technology news unless the technology story is a security hole in something the reader runs. Prefer consequence: public safety, money, law and policy, major sport results, and the reader's interests, such as an emergency near home, a security hole in something he runs, or a price change he pays. Include at most two stories from tech, homelab, gaming and internet combined, and never include a story whose only sources are Reddit or Hacker News. A story in "You should know" must not be repeated in its section. Order each section best first and include at most N stories, where N is supplied with the stories. Answer only with story ids such as s12, never headlines.`;

function distinctOutlets(item) {
  const names = (item.sources || []).map(source => source.name).filter(Boolean);
  if (names.length === 0 && item.source_name) names.push(item.source_name);
  return [...new Set(names)];
}

function isCommunityItem(item) {
  const type = String(item.source_type || '').toLowerCase();
  if (['reddit', 'hackernews', 'hacker_news', 'hn'].includes(type)) return true;
  return distinctOutlets(item).some(name => /^(reddit|hacker news|hn)$/i.test(name));
}

function communityReplies(item, limit = Infinity, maxChars = Infinity) {
  const count = Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : Infinity;
  const chars = Number.isFinite(Number(maxChars)) ? Math.max(0, Number(maxChars)) : Infinity;
  return (Array.isArray(item?.top_comments) ? item.top_comments : [])
    .filter(comment => typeof comment === 'string' && comment.trim())
    .map(comment => comment.trim())
    .filter(comment => !COMMUNITY_BOILERPLATE_REPLY_PATTERNS.some(pattern => pattern.test(comment)))
    .slice(0, count)
    .map(comment => comment.slice(0, chars));
}

function writeSystemPrompt() {
  return WRITE_SYSTEM_PROMPT;
}

function writeUserPrompt(item, { articleChars }) {
  const teasers = Array.isArray(item.merged_descriptions) && item.merged_descriptions.length > 0
    ? item.merged_descriptions
    : [item.description || ''];
  const article = String(item.article_content || '').slice(0, articleChars);
  const matches = (item.interest_matches || []).map(match => match.label).filter(Boolean);
  const lines = [
    `ORIGINAL HEADLINE: ${item.title || ''}`,
    `OUTLETS: ${distinctOutlets(item).join(', ') || 'Unknown'}`,
    `COVERAGE: ${Number(item.coverage) || 1}`,
    `INTEREST MATCHES: ${matches.join(', ') || 'None'}`,
    'TEASERS:',
    ...teasers.map(teaser => `- ${teaser}`),
    `ARTICLE TEXT (capped to ${articleChars} characters):`,
    article || '(none)',
  ];

  if (isCommunityItem(item)) {
    const comments = communityReplies(item, 5);
    if (comments.length > 0) {
      lines.push('COMMUNITY COMMENTS:');
      comments.forEach((comment, index) => lines.push(`${index + 1}. ${comment.trim()}`));
    }
  }

  return lines.join('\n');
}

function editSystemPrompt() {
  return EDIT_SYSTEM_PROMPT;
}

function editUserPrompt(stories, { sectionSize }) {
  const lines = [`SECTION LIMIT: ${sectionSize}`];
  for (const story of stories) {
    const labels = (story.interest_matches || []).map(match => match.label).filter(Boolean);
    lines.push([
      `[${story.id}]`,
      story.section,
      `coverage ${Number(story.coverage) || 1}`,
      `interests ${labels.join(', ') || 'none'}`,
      story.kicker,
      story.headline,
      story.summary,
    ].join(' | '));
  }
  return lines.join('\n');
}

module.exports = {
  WRITE_SCHEMA,
  COMMUNITY_BOILERPLATE_REPLY_PATTERNS,
  editSchema,
  isCommunityItem,
  communityReplies,
  writeSystemPrompt,
  writeUserPrompt,
  editSystemPrompt,
  editUserPrompt,
};
