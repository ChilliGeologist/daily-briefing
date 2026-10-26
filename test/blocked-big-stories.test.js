'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractClusters } = require('../src/pipeline/extractor');
const { toItem } = require('../src/pipeline/toItem');
const { writeStories, isBriefEligible } = require('../src/pipeline/writer/write');
const { deterministicEdit, eligibleTopCandidate } = require('../src/pipeline/writer/validate');
const { assemble } = require('../src/pipeline/assembler');
const { prepareSections } = require('../public/reading-logic');

const settings = {
  getPaywalledHosts: () => [],
  getWriterArticleChars: () => 6000,
};

const log = { debug() {}, info() {}, warn() {}, error() {} };

function response(body, url, contentType = 'text/html; charset=utf-8') {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    url,
    headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
    text: async () => body,
  };
}

function blockedCluster(index = 1) {
  const title = `Brazil election heads to run-off ${index}`;
  const items = ['AP', 'Reuters'].map((outlet, outletIndex) => ({
    title,
    description: `${title} ${outlet}`,
    source_name: `${outlet} (Google News)`,
    source_type: 'rss',
    source_priority: 2 - outletIndex,
    outlet: outlet.toLowerCase(),
    url: `https://${outlet.toLowerCase()}.test/story-${index}`,
    canonical_url: `https://${outlet.toLowerCase()}.test/story-${index}`,
    default_category: 'world',
  }));
  return {
    id: `cluster-${index}`,
    items,
    lead: items[0],
    coverage: 2,
    outlets: ['ap', 'reuters'],
    rank: index,
    rank_score: 100 - index,
    interest_matches: [],
  };
}

function googleFeed(title, id = 'READABLE') {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Google News</title><item>` +
    `<title>${title} - BBC</title><link>https://news.google.com/rss/articles/${id}?oc=5</link>` +
    `<description>${title} - BBC</description><pubDate>Mon, 26 Oct 2026 00:00:00 GMT</pubDate>` +
    `<source url="https://www.bbc.com">BBC</source></item></channel></rss>`;
}

function googleFeedItems(items) {
  const body = items.map(({ title, publisher, id }) =>
    `<item><title>${title} - ${publisher}</title>` +
    `<link>https://news.google.com/rss/articles/${id}?oc=5</link>` +
    `<description>${title} - ${publisher}</description>` +
    `<pubDate>Mon, 26 Oct 2026 00:00:00 GMT</pubDate>` +
    `<source url="https://example.com">${publisher}</source></item>`
  ).join('');
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Google News</title>${body}</channel></rss>`;
}

const ARTICLE_TEXT = 'Brazilian voters will return to the polls for a run-off election after neither leading candidate secured an outright majority. Officials published the complete first-round count on Sunday, and both campaigns began seeking support from eliminated rivals. The second vote is scheduled for next month under the country\'s electoral rules.';
const ARTICLE_HTML = `<!doctype html><html><head><title>Brazil election</title></head><body><article><h1>Brazil election</h1><p>${ARTICLE_TEXT}</p></article></body></html>`;

it('finds a readable copy for a blocked multi-outlet story and writes it with the extra source', async () => {
  const input = blockedCluster();
  const urls = [];
  const extracted = await extractClusters([input], settings, log, null, {
    judge: async () => true,
    fetchImpl: async (url) => {
      urls.push(url);
      if (/^(?:https:\/\/ap\.test|https:\/\/reuters\.test)/.test(url)) throw new Error('blocked');
      if (url.startsWith('https://news.google.com/rss/search?')) {
        return response(googleFeed(input.lead.title), url, 'application/rss+xml');
      }
      if (url === 'https://news.google.com/rss/articles/READABLE') {
        return response('<main data-n-a-sg="SIG" data-n-a-ts="123"></main>', url);
      }
      if (url.includes('/batchexecute')) {
        return response(`[["x","[\\"garturlres\\",\\"https://www.bbc.com/news/world-latin-america-readable\\"]"]]`, url);
      }
      if (url === 'https://www.bbc.com/news/world-latin-america-readable') {
        return response(ARTICLE_HTML, url);
      }
      throw new Error(`unexpected URL: ${url}`);
    },
  });
  const item = toItem(extracted.clusters[0]);
  let writerCalls = 0;
  const written = await writeStories([item], {
    name: 'test-writer',
    async write() {
      writerCalls++;
      return { json: {
        is_news: true,
        headline: 'Brazil election heads to run-off',
        summary: 'Brazilian voters will return for a second-round election after neither leading candidate won an outright majority.',
        kicker: 'Run-off',
        section: 'world',
      } };
    },
  }, settings, log);

  assert.deepStrictEqual({
    writerCalls,
    lookupStats: [extracted.stats.readable_copy_lookups, extracted.stats.readable_copies_found],
    article: item.article_content,
    sources: item.sources,
    story: written.stories.map(story => ({ headline: story.headline, summary: story.summary, brief: story.brief })),
  }, {
    writerCalls: 1,
    lookupStats: [1, 1],
    article: ARTICLE_TEXT,
    sources: [
      { name: 'AP (Google News)', url: 'https://ap.test/story-1' },
      { name: 'Reuters (Google News)', url: 'https://reuters.test/story-1' },
      { name: 'BBC', url: 'https://www.bbc.com/news/world-latin-america-readable' },
    ],
    story: [{
      headline: 'Brazil election heads to run-off',
      summary: 'Brazilian voters will return for a second-round election after neither leading candidate won an outright majority.',
      brief: undefined,
    }],
  });
  assert.strictEqual(urls.filter(url => url.startsWith('https://news.google.com/rss/search?')).length, 1);
});

it('accepts the Guardian Audi result only when the shared same-story judge says YES', async () => {
  const makeInput = () => {
    const input = blockedCluster();
    input.lead.title = 'Trump announces at a Georgia campaign rally that Audi will build a new auto factory in the state - AP';
    input.items[0].title = input.lead.title;
    input.items[1].title = input.lead.title.replace(' - AP', ' - Reuters');
    return input;
  };
  const candidate = 'Volkswagen to build $4bn Audi SUV factory in US despite job cuts at home';

  async function run(verdict) {
    const judgeCalls = [];
    const urls = [];
    const result = await extractClusters([makeInput()], settings, log, null, {
      judge: async (original, found) => {
        judgeCalls.push([original.title, original.description, found.title, found.description]);
        return verdict;
      },
      fetchImpl: async url => {
        urls.push(url);
        if (/^(?:https:\/\/ap\.test|https:\/\/reuters\.test)/.test(url)) throw new Error('blocked');
        if (url.startsWith('https://news.google.com/rss/search?')) {
          return response(googleFeedItems([{ title: candidate, publisher: 'The Guardian', id: 'AUDI' }]), url, 'application/rss+xml');
        }
        if (url === 'https://news.google.com/rss/articles/AUDI') {
          return response('<main data-n-a-sg="SIG" data-n-a-ts="123"></main>', url);
        }
        if (url.includes('/batchexecute')) {
          return response(`[["x","[\\"garturlres\\",\\"https://www.theguardian.com/business/audi-factory\\"]"]]`, url);
        }
        if (url === 'https://www.theguardian.com/business/audi-factory') {
          return response(ARTICLE_HTML, url);
        }
        throw new Error(`unexpected URL: ${url}`);
      },
    });
    return {
      judgeCalls,
      stats: [result.stats.readable_copy_lookups, result.stats.readable_copies_found],
      articleUrl: result.clusters[0].article_url,
      resolvedCandidate: urls.includes('https://news.google.com/rss/articles/AUDI'),
    };
  }

  assert.deepStrictEqual({
    yes: await run(true),
    no: await run(false),
  }, {
    yes: {
      judgeCalls: [[
        'Trump announces at a Georgia campaign rally that Audi will build a new auto factory in the state - AP',
        'Brazil election heads to run-off 1 AP',
        candidate,
        `${candidate} - The Guardian`,
      ]],
      stats: [1, 1],
      articleUrl: 'https://www.theguardian.com/business/audi-factory',
      resolvedCandidate: true,
    },
    no: {
      judgeCalls: [[
        'Trump announces at a Georgia campaign rally that Audi will build a new auto factory in the state - AP',
        'Brazil election heads to run-off 1 AP',
        candidate,
        `${candidate} - The Guardian`,
      ]],
      stats: [1, 0],
      articleUrl: null,
      resolvedCandidate: false,
    },
  });
});

it('never sends a one-distinctive-word search result to the judge', async () => {
  const input = blockedCluster();
  input.lead.title = 'Brazil votes in a tense Lula vs Bolsonaro runoff - AP';
  input.items[0].title = input.lead.title;
  input.items[1].title = input.lead.title.replace(' - AP', ' - Reuters');
  const judgeCalls = [];
  const result = await extractClusters([input], settings, log, null, {
    judge: async (_original, candidate) => {
      judgeCalls.push(candidate.title);
      return false;
    },
    fetchImpl: async url => {
      if (/^(?:https:\/\/ap\.test|https:\/\/reuters\.test)/.test(url)) throw new Error('blocked');
      if (url.startsWith('https://news.google.com/rss/search?')) {
        return response(googleFeedItems([
          { title: 'Brazil economy grows after exports rise', publisher: 'SBS', id: 'ONE' },
          { title: 'Lula defeats Bolsonaro in Brazil runoff vote', publisher: 'Al Jazeera', id: 'TWO' },
        ]), url, 'application/rss+xml');
      }
      throw new Error(`candidate should not resolve after a NO verdict: ${url}`);
    },
  });

  assert.deepStrictEqual({
    judgeCalls,
    stats: [result.stats.readable_copy_lookups, result.stats.readable_copies_found],
  }, {
    judgeCalls: ['Lula defeats Bolsonaro in Brazil runoff vote'],
    stats: [1, 0],
  });
});

it('keeps an unreadable major multi-outlet story as a section-ending brief outside You should know', async () => {
  const item = {
    title: 'Serbia election heads to run-off - AP',
    description: 'Serbia election heads to run-off AP',
    merged_descriptions: [
      'Serbia election heads to run-off AP',
      'Serbia election heads to run-off Reuters',
    ],
    article_content: null,
    source_name: 'AP (Google News)',
    sources: [
      { name: 'AP (Google News)', url: 'https://news.google.com/ap' },
      { name: 'Reuters (Google News)', url: 'https://news.google.com/reuters' },
    ],
    outlet_versions: [
      { name: 'AP (Google News)', headline: 'Serbia election heads to run-off', description: '', url: 'https://news.google.com/ap', text: '' },
      { name: 'Reuters (Google News)', headline: 'Serbia election heads to run-off', description: '', url: 'https://news.google.com/reuters', text: '' },
    ],
    coverage: 2,
    rank: 1,
    interest_matches: [],
  };
  let writerCalls = 0;
  const output = await writeStories([item], {
    name: 'test-writer',
    async write() { writerCalls++; throw new Error('brief must not call writer'); },
  }, settings, log);
  const brief = output.stories[0];
  const normal = {
    id: 'normal', rank: 2, coverage: 2, section: 'world', headline: 'Ordinary world story',
    summary: 'An ordinary summary.', kicker: 'World news', interest_matches: [], sources: [{ name: 'BBC' }],
  };
  const normalLater = {
    id: 'normal-later', rank: 3, coverage: 1, section: 'world', headline: 'Another world story',
    summary: 'Another ordinary summary.', kicker: 'World news', interest_matches: [], sources: [{ name: 'SBS' }],
  };
  const edit = deterministicEdit([brief, normal, normalLater], {
    sectionSize: 10,
    topSize: { min: 1, max: 1 },
  });
  const paper = assemble(edit, new Map([[brief.id, brief], [normal.id, normal], [normalLater.id, normalLater]]));
  const world = paper.sections.find(section => section.id === 'world');
  const appSource = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const rendererStart = appSource.indexOf('function renderReadingStory(');
  const renderer = appSource.slice(
    rendererStart,
    appSource.indexOf("$('#briefing-page').addEventListener", rendererStart)
  );
  const briefBranch = renderer.slice(
    renderer.indexOf('if (brief) {'),
    renderer.indexOf('\n  var summaryChildren')
  );

  assert.deepStrictEqual({
    writerCalls,
    brief: {
      headline: brief.headline,
      summary: brief.summary,
      kicker: brief.kicker,
      section: brief.section,
      is_news: brief.is_news,
      brief: brief.brief,
      write_problems: brief.write_problems,
    },
    stats: output.stats,
    eligibleTop: eligibleTopCandidate(brief, 0),
    edit,
    paperWorld: world && world.items.concat(world.more, world.briefs || []).map(story => ({ id: story.id, brief: story.brief })),
    frontEnd: {
      markedBrief: renderer.includes("(brief ? ' reading-story--brief' : '')"),
      titleUsesDirectLink: briefBranch.includes("className: 'reading-story-title'") && briefBranch.includes("target: '_blank'"),
      outletsUseDirectLinks: briefBranch.includes("className: 'reading-story-brief-source'"),
      returnsBeforeReaderButton: briefBranch.includes('return story;'),
      hasReaderAction: briefBranch.includes("'data-reading-action': 'read'"),
    },
  }, {
    writerCalls: 0,
    brief: {
      headline: 'Serbia election heads to run-off',
      summary: '',
      kicker: '',
      section: 'world',
      is_news: true,
      brief: true,
      write_problems: ['kept as brief: nothing behind headline'],
    },
    stats: {
      written: 1, repairs: 0, headline_retries: 0, fallbacks: 0,
      not_news: 0, not_news_overridden: 0, section_moves: 0, facts_removed: 0,
      numbers_unsupported: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0,
    },
    eligibleTop: false,
    edit: {
      top: ['normal'],
      sections: { tasmania: [], australia: [], world: ['normal-later'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
      more: { tasmania: [], australia: [], world: [], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
      briefs: { tasmania: [], australia: [], world: ['s1'], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    },
    paperWorld: [{ id: 'normal-later', brief: undefined }, { id: 's1', brief: true }],
    frontEnd: {
      markedBrief: true,
      titleUsesDirectLink: true,
      outletsUseDirectLinks: true,
      returnsBeforeReaderButton: true,
      hasReaderAction: false,
    },
  });
});

it('renders five normal section stories followed by an Also reported group of up to three briefs', () => {
  const normal = Array.from({ length: 5 }, (_, index) => ({
    id: `normal-${index + 1}`,
    rank: index + 1,
    coverage: 2,
    section: 'world',
    headline: `Normal story ${index + 1}`,
    summary: `Normal summary ${index + 1}.`,
    kicker: 'World news',
    interest_matches: [],
    sources: [{ name: 'Reuters' }],
  }));
  const briefs = [1, 2].map((number, index) => ({
    id: `brief-${number}`,
    rank: 6 + index,
    coverage: 2,
    section: 'world',
    headline: `Brief story ${number}`,
    summary: '',
    kicker: '',
    brief: true,
    interest_matches: [],
    sources: [{ name: 'AP' }, { name: 'Reuters' }],
  }));
  const stories = [...normal, ...briefs];
  const edit = deterministicEdit(stories, { sectionSize: 5, topSize: { min: 0, max: 0 } });
  const paper = assemble(edit, new Map(stories.map(story => [story.id, story])));
  const world = paper.sections.find(section => section.id === 'world');
  const prepared = prepareSections(paper.sections).find(group => group.section.id === 'world');
  const appSource = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

  assert.deepStrictEqual({
    edit,
    world: {
      items: world.items.map(item => item.id),
      more: world.more.map(item => item.id),
      briefs: world.briefs.map(item => item.id),
    },
    prepared: {
      shown: prepared.shown.map(item => item.id),
      briefs: prepared.briefs.map(item => item.id),
    },
    frontEnd: {
      label: appSource.includes("textContent: 'Also reported'"),
      rendersBriefGroup: appSource.includes('group.briefs.forEach'),
    },
  }, {
    edit: {
      top: [],
      sections: { tasmania: [], australia: [], world: normal.map(story => story.id), tech: [], homelab: [], gaming: [], sport: [], internet: [] },
      more: { tasmania: [], australia: [], world: [], tech: [], homelab: [], gaming: [], sport: [], internet: [] },
      briefs: { tasmania: [], australia: [], world: briefs.map(story => story.id), tech: [], homelab: [], gaming: [], sport: [], internet: [] },
    },
    world: {
      items: normal.map(story => story.id),
      more: [],
      briefs: briefs.map(story => story.id),
    },
    prepared: {
      shown: normal.map(story => story.id),
      briefs: briefs.map(story => story.id),
    },
    frontEnd: { label: true, rendersBriefGroup: true },
  });
});

it('still drops a blocked single-outlet story as nothing behind the headline', async () => {
  const item = {
    title: 'Single blocked report', description: '', article_content: null,
    source_name: 'AP (Google News)', sources: [{ name: 'AP (Google News)', url: 'https://news.google.com/ap' }],
    outlet_versions: [{ name: 'AP (Google News)', headline: 'Single blocked report', description: '', url: 'https://news.google.com/ap', text: '' }],
    coverage: 1, interest_matches: [],
  };
  let writerCalls = 0;
  const output = await writeStories([item], {
    name: 'test-writer',
    async write() { writerCalls++; throw new Error('must not write'); },
  }, settings, log);

  assert.deepStrictEqual({
    writerCalls,
    stories: output.stories,
    dropped: output.dropped.map(story => ({ headline: story.headline, summary: story.summary, write_problems: story.write_problems })),
    briefEligible: isBriefEligible(item),
  }, {
    writerCalls: 0,
    stories: [],
    dropped: [{ headline: 'Single blocked report', summary: '', write_problems: ['not news: nothing behind headline'] }],
    briefEligible: false,
  });
});

it('requires two independent owners including a major outlet for a brief', () => {
  const item = (sources, extra = {}) => ({
    title: 'A blocked report',
    source_name: sources[0].name,
    sources,
    ...extra,
  });
  assert.deepStrictEqual({
    newsCorpOnly: isBriefEligible(item([
      { name: 'Daily Telegraph', url: 'https://dailytelegraph.com.au/news/report' },
      { name: 'The Australian', url: 'https://theaustralian.com.au/news/report' },
    ])),
    independentMajors: isBriefEligible(item([
      { name: 'AP', url: 'https://apnews.com/report' },
      { name: 'Reuters', url: 'https://reuters.com/report' },
    ])),
    sponsored: isBriefEligible(item([
      { name: 'AP', url: 'https://apnews.com/report' },
      { name: 'Reuters', url: 'https://reuters.com/report' },
    ], { description: 'Sponsored content' })),
    opinion: isBriefEligible(item([
      { name: 'AP', url: 'https://apnews.com/opinion/report' },
      { name: 'Reuters', url: 'https://reuters.com/report' },
    ], { canonical_url: 'https://apnews.com/opinion/report' })),
  }, {
    newsCorpOnly: false,
    independentMajors: true,
    sponsored: false,
    opinion: false,
  });
});

it('caps readable-copy searches at 15 and ends a timed-out lookup promptly', async () => {
  let searches = 0;
  const capped = await extractClusters(
    Array.from({ length: 16 }, (_, index) => blockedCluster(index + 1)),
    settings,
    log,
    null,
    {
      fetchImpl: async url => {
        if (url.startsWith('https://news.google.com/rss/search?')) {
          searches++;
          return response('<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>', url, 'application/rss+xml');
        }
        throw new Error('blocked');
      },
    }
  );

  const started = Date.now();
  const timedOut = await extractClusters([blockedCluster(99)], settings, log, null, {
    readableCopyTimeoutMs: 20,
    fetchImpl: async (url, options = {}) => {
      if (!url.startsWith('https://news.google.com/rss/search?')) throw new Error('blocked');
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
  });
  const elapsed = Date.now() - started;

  assert.deepStrictEqual({
    searches,
    cappedStats: [capped.stats.readable_copy_lookups, capped.stats.readable_copies_found],
    timedOutStats: [timedOut.stats.readable_copy_lookups, timedOut.stats.readable_copies_found],
    timedOutPromptly: elapsed < 250,
  }, {
    searches: 15,
    cappedStats: [15, 0],
    timedOutStats: [1, 0],
    timedOutPromptly: true,
  });
});
