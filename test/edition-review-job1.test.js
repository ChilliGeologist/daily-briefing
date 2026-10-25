'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { preWriteDropReason, writeStories } = require('../src/pipeline/writer/write');
const {
  isCommunityHelpRequest,
  isProjectPost,
  projectDropReason,
  isNonNewsEssay,
  sportDropReason,
  writingRetryReasons,
  validateWrite,
  deterministicEdit,
} = require('../src/pipeline/writer/validate');
const { parseRedditFeed } = require('../src/pipeline/sources/reddit');
const { createOllamaWriter } = require('../src/pipeline/writer/ollama');
const { parseWarningFeed, parseReleaseFeed } = require('../src/pipeline/sources/rss');
const { SECTIONS } = require('../src/pipeline/writer/sections');
const { rankClusters } = require('../src/pipeline/rank');
const { toItem } = require('../src/pipeline/toItem');
const { createSettings } = require('../src/settings');
const { assemble } = require('../src/pipeline/assembler');
const { filterItems } = require('../src/pipeline/filter');

const longArticle = Array.from({ length: 170 }, (_, index) => `word${index}`).join(' ');
const newsValue = (overrides = {}) => ({
  is_news: true,
  headline: 'Named subject does something consequential',
  summary: 'Named Subject did something consequential after officials met.',
  kicker: 'Policy',
  section: 'australia',
  ...overrides,
});
const writerSettings = {
  getWriterArticleChars: () => 6000,
  getInterests: () => [],
};

describe('Job 1 task 1 — empty, teaser and meta stories', () => {
  it('drops empty pages, short single-outlet teasers and Guardian live blogs with exact reasons', () => {
    assert.deepStrictEqual([
      preWriteDropReason({ title: 'Tiny Little Office', source_name: 'Hacker News (API)', sources: [{ name: 'Hacker News (API)' }] }),
      preWriteDropReason({ title: 'X’s reverse eternal September', article_content: Array(80).fill('word').join(' '), sources: [{ name: 'Platformer' }] }),
      preWriteDropReason({ title: 'Character.ai Bankruptcy Is First AI Bubble Domino to Fall', article_content: Array(80).fill('word').join(' '), sources: [{ name: '404 Media' }] }),
      preWriteDropReason({ title: 'Australian politics – live', canonical_url: 'https://www.theguardian.com/australia-news/live/2026/oct/15/x', article_content: longArticle, sources: [{ name: 'The Guardian AU' }] }),
    ], [
      'nothing behind headline',
      'single-outlet teaser under 150 words',
      'single-outlet teaser under 150 words',
      'Guardian live blog',
    ]);
  });

  it('keeps the explicit warning, release, discussion and photo exemptions', () => {
    const base = { title: 'Short item', sources: [{ name: 'Only outlet' }] };
    assert.deepStrictEqual([
      preWriteDropReason({ ...base, source_kind: 'warning' }),
      preWriteDropReason({ ...base, source_kind: 'release' }),
      preWriteDropReason({ ...base, source_type: 'reddit', top_comments: ['one', 'two', 'three'] }),
      preWriteDropReason({ ...base, source_type: 'reddit', images: ['https://i.redd.it/rack.jpg'] }),
      preWriteDropReason({ ...base, article_content: Array(80).fill('word').join(' '), image: 'https://publisher.test/hero.jpg' }),
    ], [null, null, null, null, 'single-outlet teaser under 150 words']);
  });

  it('retries a page-describing summary once and drops it when the retry still fails', async () => {
    const calls = [];
    const item = { title: 'Membership shell', article_content: longArticle, sources: [{ name: 'Outlet' }], interest_matches: [] };
    const bad = newsValue({ summary: 'This article contains promotional material for membership.' });
    const result = await writeStories([item], {
      name: 'fake', concurrency: 1,
      async write(...args) { calls.push(args); return { json: bad }; },
    }, writerSettings);
    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(result.stories, []);
    assert.deepStrictEqual(result.dropped.map(story => ({ title: story.title, is_news: story.is_news, summary: story.summary, write_problems: story.write_problems })), [{
      title: 'Membership shell',
      is_news: false,
      summary: 'This article contains promotional material for membership.',
      write_problems: ['page-description retry still described the page'],
    }]);
  });
});

describe('Job 1 task 2 — Reddit photos and Ollama vision', () => {
  it('takes full Reddit images from link hrefs and up to four gallery images', async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
      <title>homelab</title><entry><title>My rack</title><id>t3_photo</id>
      <link href="https://www.reddit.com/r/homelab/comments/photo/my_rack/"/><published>2026-10-15T00:00:00Z</published>
      <media:thumbnail url="https://preview.redd.it/a.jpg?width=140"/>
      <content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;img src="https://preview.redd.it/a.jpg?width=640&amp;amp;crop=smart"/&gt;&lt;img src="https://preview.redd.it/b.jpg?width=640"/&gt;&lt;img src="https://preview.redd.it/c.jpg?width=640"/&gt;&lt;img src="https://preview.redd.it/d.jpg?width=640"/&gt;&lt;img src="https://preview.redd.it/e.jpg?width=640"/&gt;&lt;/td&gt;&lt;td&gt;&lt;span&gt;&lt;a href="https://i.redd.it/a.jpg"&gt;[link]&lt;/a&gt;&lt;/span&gt; &lt;span&gt;&lt;a href="https://www.reddit.com/r/homelab/comments/photo/my_rack/"&gt;[comments]&lt;/a&gt;&lt;/span&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content>
      </entry></feed>`;
    const result = await parseRedditFeed(xml, { url: 'r/homelab', default_category: 'homelab' }, Date.parse('2026-10-16T00:00:00Z'));
    assert.deepStrictEqual(result[0], {
      title: 'My rack',
      url: 'https://www.reddit.com/r/homelab/comments/photo/my_rack/',
      external_url: null,
      description: '',
      image: 'https://i.redd.it/a.jpg',
      images: [
        'https://i.redd.it/a.jpg',
        'https://preview.redd.it/b.jpg?width=640',
        'https://preview.redd.it/c.jpg?width=640',
        'https://preview.redd.it/d.jpg?width=640',
      ],
      published: '2026-10-15T00:00:00.000Z',
      score: null,
      comment_count: null,
      source_name: 'r/homelab',
      source_type: 'reddit',
      default_category: 'homelab',
    });
  });

  it('base64-encodes the image in the Ollama chat message', async () => {
    const calls = [];
    const writer = createOllamaWriter({
      url: 'http://ollama.test', model: 'gemma4:test', numCtx: 8192,
      fetchImpl: async (url, options) => {
        calls.push([url, options]);
        if (url === 'https://i.redd.it/rack.jpg') {
          return { ok: true, arrayBuffer: async () => Uint8Array.from([0, 1, 2, 255]).buffer };
        }
        return { ok: true, json: async () => ({ message: { content: JSON.stringify(newsValue()) } }) };
      },
    });
    await writer.vision('system', 'describe', { type: 'object' }, 'https://i.redd.it/rack.jpg');
    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(JSON.parse(calls[1][1].body).messages, [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'describe', images: ['AAEC/w=='] },
    ]);
  });

  it('marks a successfully written photo story as image-described', async () => {
    const item = {
      title: '“I just need better Wi-Fi,” I said. Anyway, here’s my rack.',
      source_type: 'reddit', source_name: 'r/homelab', description: 'A rack build.',
      image: 'https://i.redd.it/rack.jpg', images: ['https://i.redd.it/rack.jpg'],
      top_comments: ['one', 'two', 'three'], sources: [{ name: 'r/homelab' }], interest_matches: [],
    };
    let visionUrl;
    const output = await writeStories([item], {
      name: 'fake', concurrency: 1,
      async vision(_system, _user, _schema, url) { visionUrl = url; return { json: newsValue({ section: 'homelab' }) }; },
      async write() { throw new Error('text writer must not be used'); },
    }, writerSettings);
    assert.strictEqual(visionUrl, 'https://i.redd.it/rack.jpg');
    assert.deepStrictEqual(output.stories.map(story => ({ image: story.image, images: story.images, image_described: story.image_described })), [{
      image: 'https://i.redd.it/rack.jpg', images: ['https://i.redd.it/rack.jpg'], image_described: true,
    }]);
  });
});

describe('Job 1 task 3 — projects, help requests and celebrity filler', () => {
  it('identifies project posts and applies interest or real-attention gates', () => {
    const low = { title: 'Show HN: I built a calendar', source_name: 'Hacker News (API)', score: 149, interest_matches: [] };
    const hot = { title: 'I made a dashboard', source_type: 'reddit', list_position: 5, top_comments: Array.from({ length: 10 }, (_, i) => `reply ${i}`), interest_matches: [] };
    const interested = { title: 'I released my Unraid helper', source_type: 'reddit', list_position: 20, top_comments: [], interest_matches: [{ label: 'Unraid', kind: 'product' }] };
    const reviewed = { title: 'Self-host AWS: run EC2, S3, VPC and RDS on your own hardware', description: "I'm an engineer at Mulga, and we build Spinifex.", source_type: 'reddit', list_position: 9, top_comments: Array(5).fill('reply'), interest_matches: [] };
    assert.deepStrictEqual([
      isProjectPost(low), projectDropReason(low),
      isProjectPost(hot), projectDropReason(hot),
      isProjectPost(interested), projectDropReason(interested),
      isProjectPost(reviewed), projectDropReason(reviewed),
    ], [true, 'project post without enough attention', true, null, true, null, true, 'project post without enough attention']);
  });

  it('recognises the reviewed help, suggestion, tutorial and personal-essay examples', () => {
    assert.deepStrictEqual([
      isCommunityHelpRequest({ title: 'How to handle this network conundrum?', source_type: 'reddit' }),
      isCommunityHelpRequest({ title: 'Improve the fairy ring interface instead of adding a fourth wheel', source_type: 'reddit' }),
      isNonNewsEssay({ title: 'The Double Headed Stack Allocator', source_name: 'Hacker News (API)' }),
      isNonNewsEssay({ title: 'Things to know when you get cancer', source_name: 'Hacker News (API)' }),
    ], [true, true, true, true]);
  });

  it('appends celebrity-family filler as settings revision 8', () => {
    const values = new Map([
      ['filler_patterns_revision', 7],
      ['filler_patterns', ['kept custom pattern']],
    ]);
    createSettings({
      getSetting: key => values.has(key) ? values.get(key) : null,
      setSetting: (key, value) => values.set(key, value),
      getAllSettings: () => Object.fromEntries(values),
    });
    assert.deepStrictEqual({
      revision: values.get('filler_patterns_revision'),
      patterns: values.get('filler_patterns'),
    }, {
      revision: 8,
      patterns: [
        'kept custom pattern',
        '/\\b(?:actor|actress|singer|rapper|musician|comedian|star|celebrity|entertainer)s?\\b.{0,100}\\b(?:gives? birth|welcomes? (?:a |their )?baby|pregnan(?:t|cy)|baby announcement|engaged|engagement|wedding|marries|married|divorce[ds]?)\\b|\\b(?:gives? birth|welcomes? (?:a |their )?baby|pregnan(?:t|cy)|baby announcement|engaged|engagement|wedding|marries|married|divorce[ds]?)\\b.{0,100}\\b(?:actor|actress|singer|rapper|musician|comedian|star|celebrity|entertainer)s?\\b/i',
        '/\\bannounces? next [‘\'“"]?project[’\'”"]?\\b.{0,80}\\b(?:family|baby|pregnan)/i',
      ],
    });
  });

  it('drops the two reviewed celebrity-family stories as filler', () => {
    const values = new Map();
    const settings = createSettings({
      getSetting: key => values.has(key) ? values.get(key) : null,
      setSetting: (key, value) => values.set(key, value),
      getAllSettings: () => Object.fromEntries(values),
    });
    const stories = [
      { title: 'Hilary Swank announces next ‘project’ in playful family video', published: '2026-10-15T00:00:00Z' },
      { title: 'Big Bang Theory star Kaley Cuoco gives birth to baby girl', published: '2026-10-15T00:00:00Z' },
      { title: 'Hospital maternity ward gets new funding', published: '2026-10-15T00:00:00Z' },
    ];
    const result = filterItems(stories, {
      maxAgeHours: 48,
      sourceMaxAge: new Map(),
      fillerPatterns: settings.getFillerPatterns(),
      now: Date.parse('2026-10-16T00:00:00Z'),
    });
    assert.deepStrictEqual({
      kept: result.kept.map(item => item.title),
      dropped: result.dropped.map(entry => entry.item.title),
      stats: result.stats,
    }, {
      kept: ['Hospital maternity ward gets new funding'],
      dropped: [
        'Hilary Swank announces next ‘project’ in playful family video',
        'Big Bang Theory star Kaley Cuoco gives birth to baby girl',
      ],
      stats: { total: 3, kept: 1, stale: 0, filler: 2 },
    });
  });
});

describe('Job 1 task 4 — sections, lead, sport and writing checks', () => {
  it('orders Sport after Gaming and before Around the internet', () => {
    assert.deepStrictEqual(SECTIONS.map(section => [section.id, section.title]), [
      ['tasmania', 'Tasmania'], ['australia', 'Australia'], ['world', 'World'],
      ['tech', 'Tech & Security'], ['homelab', 'Homelab & Self-hosting'], ['gaming', 'Gaming'],
      ['sport', 'Sport'], ['internet', 'Around the internet'],
    ]);
  });

  it('forces named technology and internet outlets out of news sections', () => {
    const base = { title: 'Technology story', description: 'A technology company changed its service.', interest_matches: [], coverage: 1 };
    assert.deepStrictEqual([
      validateWrite(newsValue({ section: 'world' }), { ...base, source_name: 'Hacker News (API)' }).value.section,
      validateWrite(newsValue({ section: 'australia' }), { ...base, source_name: 'r/linux', source_type: 'reddit' }).value.section,
      validateWrite(newsValue({ section: 'world' }), { ...base, source_name: 'Kottke' }).value.section,
      validateWrite(newsValue({ section: 'australia' }), { ...base, source_name: 'Bleeping Computer' }).value.section,
    ], ['tech', 'tech', 'internet', 'tech']);
  });

  it('keeps only sport meeting the event or outlet thresholds', () => {
    assert.deepStrictEqual([
      sportDropReason({ title: 'Less can be more for Rugby League World Cup opener', section: 'sport', coverage: 2 }),
      sportDropReason({ title: 'Wallabies show faith in rookie fly half for final All Blacks Test', description: 'The final Bledisloe Cup Test is in Sydney.', section: 'sport', coverage: 2 }),
      sportDropReason({ title: 'World Cup semi-final decided', section: 'sport', coverage: 1 }),
      sportDropReason({ title: 'Club signs a new player', section: 'sport', coverage: 4 }),
      sportDropReason({ title: 'Tasmania JackJumpers sign a new player', section: 'sport', coverage: 2, interest_matches: [{ label: 'JackJumpers' }] }),
    ], ['sport below significance threshold', null, null, null, null]);
  });

  it('retries lower-case, subjectless quote headlines and unnamed opening sentences', () => {
    assert.deepStrictEqual([
      writingRetryReasons(newsValue({ headline: "We'd end up in court" })),
      writingRetryReasons(newsValue({ headline: "the budget shift that 'halted' safety upgrades" })),
      writingRetryReasons(newsValue({ summary: 'The legal action uses a rarely tested provision. Officials responded.' })),
      writingRetryReasons(newsValue({ summary: 'Jordon Steele-John took leave while complaints are investigated.' })),
    ], [
      ['headline is only a quote with no named subject'],
      ['headline starts with a lower-case letter'],
      ['summary opens without naming anyone'],
      [],
    ]);
  });

  it('leads with widest coverage but not a merely place-matched local story', () => {
    const stories = [
      { id: 'local', rank: 1, section: 'tasmania', coverage: 9, sources: [{ name: 'A' }, { name: 'B' }], interest_matches: [{ label: 'Launceston', kind: 'place' }], headline: 'Council changes meeting time', summary: 'Launceston council changed a meeting time.' },
      { id: 'wide', rank: 2, section: 'australia', coverage: 8, sources: [{ name: 'A' }, { name: 'B' }], interest_matches: [], headline: 'Jobless rate rises nationally', summary: 'The national jobless rate rose.' },
      { id: 'fire', rank: 3, section: 'tasmania', coverage: 3, sources: [{ name: 'A' }, { name: 'B' }], interest_matches: [{ label: 'Emergencies', kind: 'topic', urgent: true }, { label: 'West Tamar', kind: 'place' }], headline: 'Riverside house gutted by fire', summary: 'A Riverside house was gutted by fire.' },
    ];
    assert.deepStrictEqual(deterministicEdit(stories, { sectionSize: 5, topSize: { min: 3, max: 7 } }).top, ['wide', 'local', 'fire']);
  });
});

describe('Job 1 task 5 — warning, release and no-solo-top sources', () => {
  it('keeps only relevant northern Tasmanian land warnings', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Warnings</title><link>https://bom.test/</link><description>Warnings</description>
      <item><title>Severe Weather Warning for North East and Central North</title><link>https://bom.test/1</link><description>Damaging winds near Launceston.</description></item>
      <item><title>Marine Wind Warning for Tasmanian Waters</title><link>https://bom.test/2</link><description>Coastal waters.</description></item>
      <item><title>Cancellation of Flood Watch for North West Coast</title><link>https://bom.test/3</link><description>Cancelled.</description></item>
      <item><title>Frost Warning for South East</title><link>https://bom.test/4</link><description>Frost.</description></item>
      <item><title>Sheep Graziers Warning for Central North</title><link>https://bom.test/5</link><description>Cold weather.</description></item>
      <item><title>Severe Sheep Graziers Warning for Central North</title><link>https://bom.test/6</link><description>Dangerous exposure.</description></item>
    </channel></rss>`;
    const result = await parseWarningFeed(xml, { name: 'BoM Tasmania', default_category: 'world', config: { kind: 'warning' } });
    assert.deepStrictEqual(result.map(item => ({ title: item.title, section: item.default_category, kind: item.source_kind, no_solo_top: Boolean(item.no_solo_top) })), [
      { title: 'Severe Weather Warning for North East and Central North', section: 'local', kind: 'warning', no_solo_top: false },
      { title: 'Severe Sheep Graziers Warning for Central North', section: 'local', kind: 'warning', no_solo_top: false },
    ]);
  });

  it('filters GitHub patch releases unless security-relevant and rejects prereleases', async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <title>Releases</title>
      <entry><title>v3.2.1</title><link href="https://github.com/x/y/releases/tag/v3.2.1"/><content>Bug fixes.</content></entry>
      <entry><title>v3.2.0</title><link href="https://github.com/x/y/releases/tag/v3.2.0"/><content>Breaking configuration change.</content></entry>
      <entry><title>v3.1.9</title><link href="https://github.com/x/y/releases/tag/v3.1.9"/><content>Security fix for CVE-2026-1234.</content></entry>
      <entry><title>v3.1.8-rc1</title><link href="https://github.com/x/y/releases/tag/v3.1.8-rc1"/><content>Preview.</content></entry>
      <entry><title>v3.1.8b1</title><link href="https://github.com/x/y/releases/tag/v3.1.8b1"/><content>Beta shorthand.</content></entry>
      <entry><title>v3.1.7</title><link href="https://github.com/x/y/releases/tag/v3.1.7"/><content>Bug fixes.</content></entry>
    </feed>`;
    const result = await parseReleaseFeed(xml, { name: 'Project releases', url: 'https://github.com/x/y/releases.atom', default_category: 'tech', config: { kind: 'release' } });
    assert.deepStrictEqual(result.map(item => [item.title, item.default_category, item.source_kind]), [
      ['v3.2.0', 'homelab', 'release'],
      ['v3.1.9', 'homelab', 'release'],
    ]);
  });

  it('removes top eligibility from a lone no-solo-top outlet', () => {
    const cluster = noSolo => ({
      id: noSolo ? 'pulse' : 'normal', coverage: 1,
      lead: { title: 'Breaking shock emergency', description: 'Breaking shock emergency', source_name: noSolo ? 'Pulse Tasmania' : 'Outlet', no_solo_top: noSolo },
      items: [{ title: 'Breaking shock emergency', description: 'Breaking shock emergency', source_name: noSolo ? 'Pulse Tasmania' : 'Outlet', no_solo_top: noSolo, list_position: 1 }],
    });
    const ranked = rankClusters([cluster(true), cluster(false)], { now: Date.now(), interests: [] }).selected;
    assert.deepStrictEqual(ranked.map(item => [item.id, item.rank_score]), [['pulse', 35], ['normal', 35]]);
    const stories = ranked.map((item, index) => ({
      ...item, id: item.id, rank: index + 1, section: 'tasmania', sources: [{ name: item.lead.source_name }],
      no_solo_top: item.lead.no_solo_top, interest_matches: [{ label: 'Tasmania', kind: 'place' }],
      headline: item.lead.title, summary: item.lead.description,
    }));
    assert.deepStrictEqual(deterministicEdit(stories, { sectionSize: 5, topSize: { min: 1, max: 2 } }).top, ['normal']);
  });
});

describe('Job 1 task 6 — per-outlet source material', () => {
  it('keeps each member headline, description, URL and available text', () => {
    const lead = { title: 'Outlet A headline', description: 'A description', source_name: 'Outlet A', url: 'https://a.test/story', canonical_url: 'https://a.test/story', article_content: 'A extracted text', image: null };
    const other = { title: 'Outlet B headline', description: 'B description', source_name: 'Outlet B', url: 'https://b.test/story', canonical_url: 'https://b.test/story', image: null };
    const result = toItem({ lead, items: [lead, other], coverage: 2, rank_score: 10, rank: 1, article_text: 'A extracted text', article_html: '<p>A</p>', article_url: lead.url });
    assert.deepStrictEqual(result.outlet_versions, [
      { name: 'Outlet A', headline: 'Outlet A headline', description: 'A description', url: 'https://a.test/story', text: 'A extracted text' },
      { name: 'Outlet B', headline: 'Outlet B headline', description: 'B description', url: 'https://b.test/story', text: 'B description' },
    ]);
  });
});

describe('Job 1 task 7 — how it was told', () => {
  const toldModule = () => require('../src/pipeline/writer/told');
  const versions = [
    { name: 'The Guardian AU', headline: 'Steele-John takes leave amid complaints', description: 'The senator rejected the claims.', url: 'https://guardian.test/a', text: 'The senator rejected the claims and sought a fair process.' },
    { name: 'News.com.au', headline: 'Shock accusation rocks Greens senator', description: 'A shock accusation was made.', url: 'https://news.test/a', text: 'Shock accusation rocks Greens senator.' },
  ];

  it('validates quotes per outlet, drops undersupported subjects and calculates differs', () => {
    const { buildTold } = toldModule();
    const raw = { subjects: [
      { name: 'Jordon Steele-John', kind: 'person', stances: [
        { outlet: 'The Guardian AU', stance: 'plain', quote: 'rejected the claims' },
        { outlet: 'News.com.au', stance: 'against', quote: '“Shock accusation”' },
      ] },
      { name: 'The Greens', kind: 'party', stances: [
        { outlet: 'The Guardian AU', stance: 'against', quote: 'words not present' },
        { outlet: 'News.com.au', stance: 'against', quote: 'Shock accusation' },
      ] },
    ] };
    assert.deepStrictEqual(buildTold(versions, raw), {
      outlets: versions.map(({ name, headline, url }) => ({ name, headline, url })),
      subjects: [{ name: 'Jordon Steele-John', kind: 'person', stances: [
        { outlet: 'The Guardian AU', stance: 'plain', quote: 'rejected the claims' },
        { outlet: 'News.com.au', stance: 'against', quote: '“Shock accusation”' },
      ] }],
      differs: true,
    });
  });

  it('makes the told call and one stance verification, then preserves told in briefing data', async () => {
    const { addToldToStories } = toldModule();
    const calls = [];
    const story = { id: 's1', headline: 'Steele-John takes leave', title: 'Steele-John takes leave', summary: 'Complaints are under review.', kicker: 'Politics', section: 'australia', coverage: 2, outlet_versions: versions, sources: versions.map(({ name, url }) => ({ name, url })) };
    const output = await addToldToStories([story], {
      async tell(...args) {
        calls.push(args);
        if (calls.length === 2) return { json: { a: 'yes', b: 'yes', c: 'against' } };
        return { json: { subjects: [{ name: 'Jordon Steele-John', kind: 'person', stances: [
          { outlet: 'The Guardian AU', stance: 'plain', quote: 'rejected the claims' },
          { outlet: 'News.com.au', stance: 'against', quote: 'Shock accusation' },
        ] }] } };
      },
    });
    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(output[0].told, {
      outlets: versions.map(({ name, headline, url }) => ({ name, headline, url })),
      subjects: [{ name: 'Jordon Steele-John', kind: 'person', stances: [
        { outlet: 'The Guardian AU', stance: 'plain', quote: 'rejected the claims' },
        { outlet: 'News.com.au', stance: 'against', quote: 'Shock accusation' },
      ] }],
      differs: true,
    });
    const briefing = assemble({ top: ['s1'], sections: {}, more: {} }, new Map([['s1', output[0]]]));
    assert.deepStrictEqual(briefing.sections[0].items[0].told, output[0].told);
  });
});
