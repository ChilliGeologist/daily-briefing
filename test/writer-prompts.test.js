'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const {
  WRITE_SCHEMA,
  editSchema,
  writeSystemPrompt,
  writeUserPrompt,
  editSystemPrompt,
  editUserPrompt,
} = require('../src/pipeline/writer/prompts');

it('defines the exact closed write schema', () => {
  assert.deepStrictEqual(WRITE_SCHEMA, {
    type: 'object',
    additionalProperties: false,
    required: ['is_news', 'headline', 'summary', 'detail', 'kicker', 'section'],
    properties: {
      is_news: { type: 'boolean' },
      headline: { type: 'string' },
      summary: { type: 'string' },
      detail: { type: 'string' },
      kicker: { type: 'string' },
      section: { type: 'string', enum: ['tasmania', 'australia', 'world', 'tech', 'homelab', 'gaming', 'internet'] },
    },
  });
});

it('builds a fixed Australian-English writer system prompt', () => {
  assert.strictEqual(writeSystemPrompt(), `You write a concise morning news briefing in Australian English. Decide whether the supplied page is a genuine news story, then write it for one reader who lives in West Tamar near Launceston, Tasmania and reads on a phone at breakfast.

Choose exactly one section:
- tasmania — Tasmanian news, local government, events and what's on.
- australia — Australian national and interstate news.
- world — News outside Australia.
- tech — General technology, privacy and security news.
- homelab — Homelab, self-hosting, servers, networking and related products.
- gaming — Video games and gaming communities.
- internet — Reddit and Hacker News culture, online communities and oddities.

The section is where the story happens, not who reports it: a story set overseas is world even from an Australian outlet; federal politics and stories set in other states are australia; tasmania is only for stories set in Tasmania; a security or privacy story about a tech company is tech. Overseas sport, entertainment and celebrity stories are world unless an Australian team, player or event is central.

Keep the publisher's headline unless it is vague, clickbait or misleading, and never make it vaguer; no padding, no "In a significant development", no rhetorical questions. The kicker is one or two words, in sentence case (capital first letter only, except proper names), and more specific than the section. Never use the section's own name or a bare place name as the kicker, and never make it a sentence or a reason the story was picked.

Use only facts stated in the supplied text; never add a cause of death, illness, diagnosis, criminal charge, age, number, place, name or quote that the text does not state. If the text says a cause is unknown or under investigation, say exactly that. Describe proposals, polls and rumours as proposals, polls and rumours, never as settled facts. Write whole sentences that make sense alone.

If the article text is missing, short or is clearly not the story (a cookie notice, a login or subscribe page), write plain news from the headline and teasers. Never mention missing or unavailable text, content, information or details, and never mark a story not news because article text is missing.

Never mention the reader, where they live, or what the text does not say about them.

The summary is one sentence of no more than 30 words. The detail is 60–120 words, synthesising all sources and noting where they disagree. Set is_news to false for quizzes, puzzles, ads, sponsored content, listicles, live-blog shells and pages with no story. For Reddit and Hacker News posts, set is_news to true for a showcase, a guide, an announcement or a discussion with useful substance; set it to false for a request for help, a buying question or a beginner question. A personal homepage, CV, portfolio or profile page is not news.`);
});

it('builds a complete per-story prompt with capped article and five community comments', () => {
  const prompt = writeUserPrompt({
    title: 'Original headline',
    source_type: 'reddit',
    sources: [{ name: 'Reddit' }, { name: 'ABC' }, { name: 'Reddit' }],
    coverage: 2,
    interest_matches: [{ label: 'West Tamar' }, { label: 'Emergencies' }],
    merged_descriptions: ['Teaser one.', 'Teaser two.'],
    article_content: '123456789',
    top_comments: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'],
  }, { articleChars: 5 });

  assert.strictEqual(prompt, `ORIGINAL HEADLINE: Original headline
OUTLETS: Reddit, ABC
COVERAGE: 2
INTEREST MATCHES: West Tamar, Emergencies
TEASERS:
- Teaser one.
- Teaser two.
ARTICLE TEXT (capped to 5 characters):
12345
COMMUNITY COMMENTS:
1. One
2. Two
3. Three
4. Four
5. Five`);
});

it('defines an edit schema constrained to the supplied story ids and fixed editor prompt', () => {
  const sectionArray = { type: 'array', items: { type: 'string', enum: ['s1', 's2'] } };
  assert.deepStrictEqual(editSchema(['s1', 's2']), {
    type: 'object',
    additionalProperties: false,
    required: ['top', 'sections'],
    properties: {
      top: sectionArray,
      sections: {
        type: 'object',
        additionalProperties: false,
        required: ['tasmania', 'australia', 'world', 'tech', 'homelab', 'gaming', 'internet'],
        properties: {
          tasmania: sectionArray,
          australia: sectionArray,
          world: sectionArray,
          tech: sectionArray,
          homelab: sectionArray,
          gaming: sectionArray,
          internet: sectionArray,
        },
      },
    },
  });
  assert.strictEqual(editSystemPrompt(), `You edit a complete morning briefing. Pick 5–7 stories for "You should know". Wide coverage marks a big story, but celebrity, entertainment and gossip stories never go in "You should know" however wide their coverage. Public safety and deaths in Tasmania, and major world events, outrank technology news unless the technology story is a security hole in something the reader runs. Prefer consequence: public safety, money, law and policy, major sport results, and the reader's interests, such as an emergency near home, a security hole in something he runs, or a price change he pays. Include at most two stories from tech, homelab, gaming and internet combined, and never include a story whose only sources are Reddit or Hacker News. A story in "You should know" must not be repeated in its section. Order each section best first and include at most N stories, where N is supplied with the stories. Answer only with story ids such as s12, never headlines.`);
});

it('formats every story for the editor on one line', () => {
  assert.strictEqual(editUserPrompt([
    { id: 's1', section: 'tasmania', coverage: 3, interest_matches: [{ label: 'West Tamar' }], kicker: 'Council', headline: 'Rates change', summary: 'Rates will change.' },
    { id: 's2', section: 'world', coverage: 1, interest_matches: [], kicker: 'Diplomacy', headline: 'Talks resume', summary: 'Talks have resumed.' },
  ], { sectionSize: 4 }), `SECTION LIMIT: 4
[s1] | tasmania | coverage 3 | interests West Tamar | Council | Rates change | Rates will change.
[s2] | world | coverage 1 | interests none | Diplomacy | Talks resume | Talks have resumed.`);
});
