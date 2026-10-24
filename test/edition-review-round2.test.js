'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { DEFAULT_INTERESTS, matchInterests } = require('../src/pipeline/writer/interests');
const {
  isCommunityHelpRequest,
  isProtectedGamingNews,
  isSportStory,
  sportDropReason,
  validateWrite,
} = require('../src/pipeline/writer/validate');
const {
  isMultiStoryRoundup,
  isRedditPhotoPost,
  preWriteDropReason,
  writeStories,
} = require('../src/pipeline/writer/write');
const { buildTold } = require('../src/pipeline/writer/told');
const { fetchRSS } = require('../src/pipeline/sources/rss');
const { toItem } = require('../src/pipeline/toItem');

const longArticle = Array.from({ length: 170 }, (_, index) => `word${index}`).join(' ');
const log = { debug() {}, info() {}, warn() {}, error() {} };

function written(section = 'australia') {
  return {
    is_news: true,
    headline: 'Named subject announces a consequential change',
    summary: 'Named Subject announced a consequential change after officials met.',
    kicker: 'Policy',
    section,
  };
}

describe('Round 2 item 1 — deterministic sport', () => {
  it('detects sport from URL and named competitions, then applies the exact keep rules', () => {
    const examples = [
      { title: 'A community story', canonical_url: 'https://example.test/sport/community/story' },
      { title: 'Cowan handed AFL suspension following illicit substance investigation' },
      { title: "Wallaroos believe 'possibilities are endless' ahead of 2029 World Cup" },
      { title: "How the joy of Pride is 'a form of resistance'", description: 'AFLW Pride Round begins.' },
      { title: 'De Minaur falls to world number one Zverev in Shanghai', article_content: 'The tennis match ended in straight sets.' },
      { title: 'Supercars to return to Phillip Island after MotoGP exit' },
      { title: "Builder revealed, but cost of new stadium still 'being worked through'", description: "Hobart's AFL stadium builder and price were discussed." },
      { title: 'Council approves a library extension' },
    ];
    assert.deepStrictEqual(examples.map(item => isSportStory(item)), [true, true, true, true, true, true, false, false]);
    assert.deepStrictEqual([
      sportDropReason({ title: 'World Cup opener a reminder of Test rugby league glory', coverage: 1 }),
      sportDropReason({ title: 'World Cup semi-final decided', coverage: 1 }),
      sportDropReason({ title: 'AFL club changes coach', coverage: 4 }),
      sportDropReason({ title: "Tasmania's Jewels enter WNBL with debut win", coverage: 2 }),
    ], ['sport below significance threshold', null, null, null]);
  });

  it('matches Tasmania Jewels and place-qualified Jewels as the Events interest', () => {
    assert.deepStrictEqual([
      matchInterests('Tasmania Jewels win in Hobart', DEFAULT_INTERESTS).map(match => match.label),
      matchInterests('Jewels win their opener in Hobart', DEFAULT_INTERESTS).map(match => match.label),
      matchInterests('Jewels win their opener', DEFAULT_INTERESTS).map(match => match.label),
    ], [
      ['Tasmania', 'Events'],
      ['Tasmania', 'Events'],
      [],
    ]);
  });
});

describe('Round 2 items 2 and 3 — round-ups and advertising', () => {
  it('drops newsletter titles, semicolon lists, and a Reddit-linked multi-story source page', () => {
    const homepageText = 'BusinessHazell Bros opens $12m plant HealthHospital wait times rise BasketballTasmania Jewels win in Hobart CommunityMarket opens Saturday';
    const homepage = {
      title: 'Pulse Tasmania - Free breaking news and top stories from Hobart and Tasmania',
      source_type: 'reddit',
      external_url: 'https://pulsetasmania.com.au/',
      article_content: homepageText,
      sources: [{ name: 'r/tasmania' }],
    };
    assert.deepStrictEqual([
      isMultiStoryRoundup({ title: 'Morning Mail: first story; second story; third story' }),
      isMultiStoryRoundup({ title: 'ACT abuse allegations; renters eye housing drop; execution stream cancelled' }),
      isMultiStoryRoundup(homepage),
      preWriteDropReason({ title: 'Afternoon Update: the latest', article_content: longArticle, sources: [{ name: 'Outlet' }] }),
      preWriteDropReason(homepage),
    ], [true, true, true, 'multi-story round-up', 'multi-story round-up']);
  });

  it('drops advertorial signals in titles, copy, and URL paths', () => {
    const base = { article_content: longArticle, sources: [{ name: '7NEWS' }] };
    assert.deepStrictEqual([
      preWriteDropReason({ ...base, title: 'Cooking with Coles: Three easy recipes' }),
      preWriteDropReason({ ...base, title: 'A useful guide', description: 'Brought to you by Example Corp' }),
      preWriteDropReason({ ...base, title: 'A useful guide', canonical_url: 'https://news.test/partner-content/guide' }),
      preWriteDropReason({ ...base, title: 'Council approves a library extension' }),
    ], ['advertorial', 'advertorial', 'advertorial', null]);
  });
});

describe('Round 2 items 4–6 — Reddit substance and firm keep/drop rules', () => {
  it('limits photo posts to Reddit-owned image content and judges article links by article text', () => {
    const photo = { source_type: 'reddit', url: 'https://reddit.com/r/homelab/comments/1/rack', images: ['https://i.redd.it/rack.jpg'] };
    const gallery = { source_type: 'reddit', url: 'https://reddit.com/gallery/abc', images: ['https://preview.redd.it/rack.jpg'] };
    const link = {
      title: 'The Kelly Clarkson Store Saga Has Only One Embarrassing Party',
      source_type: 'reddit', url: 'https://reddit.com/r/popular/comments/1/story', external_url: 'https://slate.com/life/story.html',
      images: ['https://i.redd.it/screenshot.png'], real_reply_count: 194, article_content: '', sources: [{ name: 'r/popular' }],
    };
    assert.deepStrictEqual([
      isRedditPhotoPost(photo),
      isRedditPhotoPost(gallery),
      isRedditPhotoPost(link),
      preWriteDropReason(link),
    ], [true, true, false, 'nothing behind headline']);
  });

  it('drops personal help requests regardless of attention but keeps a general discussion', () => {
    const reddit = title => ({ title, source_type: 'reddit', real_reply_count: 500, score: 1000 });
    assert.deepStrictEqual([
      isCommunityHelpRequest(reddit('Can you P2P proxy + access controll?')),
      isCommunityHelpRequest(reddit("First attempt, what's next?")),
      isCommunityHelpRequest(reddit('My first rack: which switch should I buy?')),
      isCommunityHelpRequest(reddit('I have a NAS, is it worth adding a mini PC?')),
      isCommunityHelpRequest(reddit('Do you not patch your docker images against CVEs?')),
    ], [true, true, true, true, false]);
  });

  it('never treats a shared article as a help request, whatever its headline asks', () => {
    const shared = {
      title: 'More than 1 in 3 Australian adults are functionally illiterate. How can we fix this?',
      source_type: 'reddit', source_name: 'r/australia', real_reply_count: 8,
      external_url: 'https://theconversation.com/more-than-1-in-3-australian-adults-are-functionally-illiterate',
    };
    assert.strictEqual(isCommunityHelpRequest(shared), false);
  });

  it('protects interest-list updates and roster news with three real replies from not-news calls', async () => {
    const update = {
      title: 'Dota 2 Update for October 15, 2026', source_type: 'reddit', source_name: 'r/DotA2',
      default_category: 'gaming', real_reply_count: 8, top_comments: ['one', 'two', 'three'],
      description: 'Fixed a missing ability effect.', sources: [{ name: 'r/DotA2' }], outlet_versions: [{ name: 'r/DotA2' }],
      interest_matches: [{ label: 'Dota 2', kind: 'product' }], coverage: 1,
    };
    const roster = { ...update, title: 'Malr1ne Joins Team Liquid', interest_matches: [], real_reply_count: 71 };
    assert.deepStrictEqual([isProtectedGamingNews(update), isProtectedGamingNews(roster)], [true, true]);

    const output = await writeStories([update], {
      name: 'fake', concurrency: 1,
      async write() { return { json: { ...written('gaming'), is_news: false } }; },
    }, { getWriterArticleChars: () => 6000, getInterests: () => [] });
    assert.deepStrictEqual({
      kept: output.stories.map(story => ({ title: story.title, is_news: story.is_news, section: story.section, problems: story.write_problems })),
      dropped: output.dropped.map(story => story.title),
    }, {
      kept: [{ title: 'Dota 2 Update for October 15, 2026', is_news: true, section: 'gaming', problems: ['kept: interest-list gaming news'] }],
      dropped: [],
    });
  });
});

describe('Round 2 item 7 — told stance validation', () => {
  it('treats straight single quotation marks as attributed words', () => {
    const versions = [
      { name: 'One', headline: 'Policy report', url: 'https://one.test', text: "The report printed 'a disgraceful policy choice' in a highlighted box." },
      { name: 'Two', headline: 'Policy analysis', url: 'https://two.test', text: "The analysis repeated 'a reckless policy choice' below the headline." },
    ];
    assert.deepStrictEqual(buildTold(versions, { subjects: [{
      name: 'Policy', kind: 'cause', stances: [
        { outlet: 'One', stance: 'against', quote: 'a disgraceful policy choice' },
        { outlet: 'Two', stance: 'against', quote: 'a reckless policy choice' },
      ],
    }] }), {
      outlets: [
        { name: 'One', headline: 'Policy report', url: 'https://one.test' },
        { name: 'Two', headline: 'Policy analysis', url: 'https://two.test' },
      ],
    });
  });

  it('removes attributed stances and all-plain subjects, including plain charge reporting', () => {
    const versions = [
      { name: 'SBS', headline: 'Navy investigates', url: 'https://sbs.test/a', text: '"This act is the most despicable betrayal of trust," the minister said in a statement.' },
      { name: 'Guardian', headline: 'Navy investigates', url: 'https://guardian.test/a', text: 'The minister described the incident as a despicable betrayal of trust.' },
      { name: 'ABC', headline: 'Woman charged over lunch', url: 'https://abc.test/a', text: "The woman allegedly contaminated her colleague's curry with poisonous snail pellets." },
      { name: 'BBC', headline: 'Australian woman charged with lacing curry', url: 'https://bbc.test/a', text: 'Australian woman charged with lacing colleague curry with snail poison.' },
    ];
    const raw = { subjects: [
      { name: 'Navy', kind: 'organisation', stances: [
        { outlet: 'SBS', stance: 'against', quote: 'This act is the most despicable betrayal of trust' },
        { outlet: 'Guardian', stance: 'against', quote: 'despicable betrayal of trust' },
      ] },
      { name: 'Woman', kind: 'person', stances: [
        { outlet: 'ABC', stance: 'against', quote: "The woman allegedly contaminated her colleague's curry" },
        { outlet: 'BBC', stance: 'against', quote: 'Australian woman charged with lacing colleague curry' },
      ] },
    ] };
    assert.deepStrictEqual(buildTold(versions, raw), {
      outlets: [
        { name: 'SBS', headline: 'Navy investigates', url: 'https://sbs.test/a' },
        { name: 'Guardian', headline: 'Navy investigates', url: 'https://guardian.test/a' },
        { name: 'ABC', headline: 'Woman charged over lunch', url: 'https://abc.test/a' },
        { name: 'BBC', headline: 'Australian woman charged with lacing curry', url: 'https://bbc.test/a' },
      ],
    });
  });

  it('sets differs only when a surviving subject has two post-validation stances', () => {
    const versions = [
      { name: 'Outlet A', headline: 'Minister slammed policy as cruel', url: 'https://a.test', text: 'Minister slammed policy as cruel and unworkable.' },
      { name: 'Outlet B', headline: 'Minister releases policy', url: 'https://b.test', text: 'Minister releases policy after cabinet meeting.' },
      { name: 'Outlet C', headline: 'Minister backs policy', url: 'https://c.test', text: 'Minister backs policy as practical.' },
    ];
    const subject = {
      name: 'Policy', kind: 'cause', stances: [
        { outlet: 'Outlet A', stance: 'against', quote: 'slammed policy as cruel' },
        { outlet: 'Outlet B', stance: 'plain', quote: 'releases policy after cabinet meeting' },
      ],
    };
    assert.deepStrictEqual([
      buildTold(versions, { subjects: [subject] }).differs,
      buildTold(versions, { subjects: [{ ...subject, stances: [
        { outlet: 'Outlet A', stance: 'toward', quote: 'policy as cruel and unworkable' },
        { outlet: 'Outlet C', stance: 'toward', quote: 'backs policy as practical' },
      ] }] }).differs,
    ], [true, false]);
  });
});

describe('Round 2 items 8–10 — routing and source configuration', () => {
  it('routes single-outlet homelab publishers, releases, and self-host titles to Homelab', () => {
    const base = { title: 'A technical article', description: 'A technical article with enough evidence.', interest_matches: [], coverage: 1 };
    assert.deepStrictEqual([
      validateWrite(written('tech'), { ...base, source_name: 'Jeff Geerling' }).value.section,
      validateWrite(written('world'), { ...base, source_name: 'ServeTheHome' }).value.section,
      validateWrite(written('tech'), { ...base, source_name: 'Home Assistant Blog' }).value.section,
      validateWrite(written('tech'), { ...base, source_kind: 'release' }).value.section,
      validateWrite(written('tech'), { ...base, title: 'What I Self-Host', source_name: 'Hacker News (API)' }).value.section,
      validateWrite(written('tech'), { ...base, source_name: 'Jeff Geerling', coverage: 2 }).value.section,
    ], ['homelab', 'homelab', 'homelab', 'homelab', 'homelab', 'tech']);
  });

  it('uses a desktop Chrome user agent for warnings and propagates short_ok from RSS config', async () => {
    const seen = [];
    const server = http.createServer((request, response) => {
      seen.push(request.headers['user-agent']);
      response.setHeader('content-type', 'application/rss+xml');
      response.end('<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><link>https://feed.test</link><description>Feed</description><item><title>Useful link</title><link>https://feed.test/link</link><description>Forty words are enough for this configured link blog item to pass its source-level short-content exemption.</description></item></channel></rss>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}/feed`;
      const warning = await fetchRSS({ name: 'BoM', url, config: { kind: 'warning' } }, log);
      const links = await fetchRSS({ name: 'Kottke', url, config: { short_ok: true } }, log);
      assert.deepStrictEqual({
        userAgents: seen,
        warningError: warning.error,
        shortFlags: links.items.map(item => item.short_ok),
      }, {
        userAgents: [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'DailyBriefing/2.0',
        ],
        warningError: null,
        shortFlags: [true],
      });
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('exempts short_ok only from the 150-word teaser rule and preserves it through clustering', () => {
    const base = { title: 'Useful link', sources: [{ name: 'Kottke' }], short_ok: true };
    assert.deepStrictEqual([
      preWriteDropReason({ ...base, article_content: Array(80).fill('word').join(' ') }),
      preWriteDropReason({ ...base, article_content: Array(39).fill('word').join(' ') }),
    ], [null, 'nothing behind headline']);

    const lead = { ...base, source_name: 'Kottke', url: 'https://kottke.test/a', description: 'Useful link.', published: null };
    assert.deepStrictEqual(toItem({ lead, items: [lead], rank_score: 1, coverage: 1, rank: 1 }), {
      ...lead,
      title: 'Useful link',
      sources: [{ name: 'Kottke', url: 'https://kottke.test/a' }],
      outlet_versions: [{ name: 'Kottke', headline: 'Useful link', description: 'Useful link.', url: 'https://kottke.test/a', text: 'Useful link.' }],
      merged_descriptions: ['Useful link.'], image: null, published: null, relevance_score: 1,
      article_content: undefined, article_html: undefined, article_url: undefined, canonical_url: undefined,
      top_comments: undefined, interest_matches: [], coverage: 1, rank: 1,
    });
  });
});
