'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildTold } = require('../src/pipeline/writer/told');
const { validateWrite } = require('../src/pipeline/writer/validate');
const { writeStories } = require('../src/pipeline/writer/write');
const {
  NEEDS_COMPANION,
  UNAMBIGUOUS,
  matchTasmanianPlaces,
} = require('../src/pipeline/writer/tasmanian-places');

const log = { debug() {}, info() {}, warn() {}, error() {} };
const settings = {
  getWriterArticleChars: () => 6000,
  getInterests: () => [],
};

function written(kicker, section = 'world', summary = 'Officials confirmed the change after a meeting.') {
  return {
    is_news: true,
    headline: 'Officials confirm a consequential change',
    summary,
    kicker,
    section,
  };
}

describe('Round 3 item 1 — kicker sentence case on every path', () => {
  it('sentence-cases complete kickers from normal, named-label and fallback paths', () => {
    const examples = [
      {
        kicker: 'Stadium Cost',
        item: {
          title: "Builder revealed, but cost of new stadium still 'being worked through'",
          description: 'The stadium cost is still being worked through.',
          interest_matches: [{ label: 'Stadium Cost', kind: 'topic' }],
        },
        raw: null,
      },
      {
        kicker: 'Art Prize',
        item: {
          title: 'NSW artist wins major Sculpture by the Sea prize',
          description: 'An artist won the annual prize at Bondi.',
          interest_matches: [{ label: 'Art Prize', kind: 'topic' }],
        },
      },
      {
        kicker: 'Adult Skills',
        item: {
          title: 'More Australian adults are functionally illiterate',
          description: 'The report examined adult skills across Australia.',
          interest_matches: [{ label: 'Adult Skills', kind: 'topic' }],
        },
      },
      {
        kicker: 'Spyware Attack',
        item: {
          title: 'AdFection turned targeted ads into mercenary spyware',
          description: 'Researchers documented a spyware attack.',
          interest_matches: [{ label: 'Spyware Attack', kind: 'topic' }],
        },
      },
      {
        kicker: 'Yemen Palace attack',
        item: {
          title: 'Houthi missile attack on Yemeni presidential palace kills five',
          description: 'The palace attack happened in Yemen.',
          interest_matches: [{ label: 'Yemen Palace attack', kind: 'topic' }],
        },
      },
      {
        kicker: 'Desktop BETA',
        item: {
          title: 'Wayland desktop for Linux gets a skeuomorphic design',
          description: 'The desktop remains in beta.',
          interest_matches: [{ label: 'Desktop BETA', kind: 'topic' }],
        },
      },
      {
        kicker: 'Middle East',
        item: {
          title: 'China asks Israel to halt settlement expansion',
          description: 'Diplomats discussed the dispute across the Middle East.',
          interest_matches: [{ label: 'Middle East', kind: 'topic' }],
        },
      },
    ];

    assert.deepStrictEqual(examples.map(example => {
      const raw = example.raw === null
        ? null
        : written(example.kicker, 'world', example.item.description);
      return validateWrite(raw, example.item, []).value.kicker;
    }), [
      'Stadium cost',
      'Art prize',
      'Adult skills',
      'Spyware attack',
      'Yemen palace attack',
      'Desktop beta',
      'Middle East',
    ]);
  });
});

describe('Round 3 item 2 — testimony is attribution, not outlet stance', () => {
  it('drops the Russell Brand court-evidence stances as a complete told subject', () => {
    const versions = [
      {
        name: 'ABC',
        headline: 'Court shown photos before alleged rape',
        url: 'https://abc.test/brand',
        text: 'Russell Brand asked a woman to take photos shortly before he raped her, a London court has heard.',
      },
      {
        name: 'Guardian',
        headline: 'Russell Brand trial continues',
        url: 'https://guardian.test/brand',
        text: 'The complainant said he made her take photos before forcing himself on her in a hotel room attack, the court heard.',
      },
      {
        name: 'Australian',
        headline: 'Court shown photos in Russell Brand trial',
        url: 'https://australian.test/brand',
        text: 'Court shown photos from night of alleged rape in Russell Brand trial.',
      },
    ];
    const raw = { subjects: [{
      name: 'Russell Brand',
      kind: 'person',
      stances: [
        { outlet: 'ABC', stance: 'against', quote: 'shortly before he raped her' },
        { outlet: 'Guardian', stance: 'against', quote: 'before forcing himself on her in a hotel room attack' },
        { outlet: 'Australian', stance: 'plain', quote: 'Court shown photos from night of alleged rape' },
      ],
    }] };

    assert.deepStrictEqual(buildTold(versions, raw), {
      outlets: [
        { name: 'ABC', headline: 'Court shown photos before alleged rape', url: 'https://abc.test/brand' },
        { name: 'Guardian', headline: 'Russell Brand trial continues', url: 'https://guardian.test/brand' },
        { name: 'Australian', headline: 'Court shown photos in Russell Brand trial', url: 'https://australian.test/brand' },
      ],
    });
  });

  it('recognises every specified court, testimony, allegation and prosecution attribution', () => {
    const phrases = [
      'court has heard', 'court heard', 'the court was told', 'told the court',
      'jury heard', 'the jury was told', 'told the jury', 'gave evidence',
      'testified', 'alleges', 'alleged', 'allegedly', 'prosecutors said',
      'prosecutor says', 'according to the prosecution', 'claims',
    ];
    const expected = {
      outlets: [
        { name: 'Evidence report', headline: 'Trial evidence reported', url: 'https://evidence.test' },
        { name: 'Commentary', headline: 'Conduct condemned', url: 'https://commentary.test' },
      ],
    };

    assert.deepStrictEqual(phrases.map(phrase => {
      const versions = [
        { name: 'Evidence report', headline: 'Trial evidence reported', url: 'https://evidence.test', text: `A witness ${phrase} the conduct was cruel.` },
        { name: 'Commentary', headline: 'Conduct condemned', url: 'https://commentary.test', text: 'The conduct was cruel and reprehensible.' },
      ];
      return buildTold(versions, { subjects: [{
        name: 'Defendant', kind: 'person', stances: [
          { outlet: 'Evidence report', stance: 'against', quote: 'the conduct was cruel' },
          { outlet: 'Commentary', stance: 'against', quote: 'cruel and reprehensible' },
        ],
      }] });
    }), phrases.map(() => expected));
  });
});

describe('Round 3 item 3 — specialist source routing is cluster-wide', () => {
  it('uses normal news routing when any general-news outlet is present', () => {
    const base = {
      title: 'Donald Trump cancels plan to livestream execution after international backlash',
      description: 'The US president cancelled the plan after international opposition.',
      interest_matches: [],
      coverage: 2,
    };
    const raw = written('Execution cancelled', 'world', base.description);
    assert.deepStrictEqual([
      validateWrite(raw, { ...base, sources: [{ name: '404 Media' }, { name: 'Reuters' }] }, []).value.section,
      validateWrite(raw, { ...base, sources: [{ name: '404 Media' }, { name: 'r/news' }] }, []).value.section,
      validateWrite(raw, { ...base, sources: [{ name: 'Hacker News (API)' }, { name: 'r/linux' }] }, []).value.section,
    ], ['world', 'internet', 'tech']);
  });
});

describe('Round 3 item 4 — protected gaming summaries still validate', () => {
  it('falls back from persistent meta writing and strips comment-only filler', async () => {
    const base = {
      source_type: 'reddit', source_name: 'r/DotA2', default_category: 'gaming',
      real_reply_count: 8, top_comments: ['real reply one', 'real reply two', 'real reply three'],
      sources: [{ name: 'r/DotA2' }], outlet_versions: [{ name: 'r/DotA2' }],
      interest_matches: [{ label: 'Dota 2', kind: 'product' }], coverage: 1,
    };
    const meta = {
      is_news: false,
      headline: 'Malr1ne joins Team Liquid',
      summary: 'No factual news details were provided regarding Malr1ne joining Team Liquid. Community comments included varied speculation.',
      kicker: 'Esports Roster',
      section: 'gaming',
    };
    let calls = 0;
    const roster = await writeStories([{
      ...base,
      title: 'Malr1ne Joins Team Liquid',
      description: '',
      real_reply_count: 71,
      interest_matches: [],
    }], {
      name: 'fake', concurrency: 1,
      async write() { calls++; return { json: meta }; },
    }, settings, log);

    const update = await writeStories([{
      ...base,
      title: 'Dota 2 Update for October 15, 2026',
      description: 'Fixed missing ability effect options for the Primal Beast Immortal set.',
    }], {
      name: 'fake', concurrency: 1,
      async write() {
        return { json: {
          is_news: true,
          headline: 'Valve releases a Dota 2 update',
          summary: 'Valve released a Dota 2 update on 15 October 2026. Community comments included unrelated discussion points.',
          kicker: 'Game Patch',
          section: 'gaming',
        } };
      },
    }, settings, log);

    let updateFallbackCalls = 0;
    const updateFallback = await writeStories([{
      ...base,
      title: 'Dota 2 Update for October 15, 2026',
      description: 'Fixed missing ability effect options for the Primal Beast Immortal set.',
    }], {
      name: 'fake', concurrency: 1,
      async write() {
        updateFallbackCalls++;
        return { json: {
          is_news: false,
          headline: 'Dota 2 update for October 15, 2026',
          summary: 'No factual news details were provided for the Dota 2 update.',
          kicker: 'Game Patch',
          section: 'gaming',
        } };
      },
    }, settings, log);

    assert.deepStrictEqual({
      roster: roster.stories.map(story => ({ title: story.title, summary: story.summary, kicker: story.kicker, section: story.section })),
      rosterDropped: roster.dropped.map(story => story.title),
      rosterCalls: calls,
      update: update.stories.map(story => ({ title: story.title, summary: story.summary, kicker: story.kicker, section: story.section })),
      updateDropped: update.dropped.map(story => story.title),
      updateFallback: updateFallback.stories.map(story => ({ title: story.title, summary: story.summary, kicker: story.kicker, section: story.section })),
      updateFallbackCalls,
    }, {
      roster: [{ title: 'Malr1ne Joins Team Liquid', summary: 'Malr1ne has joined Team Liquid.', kicker: 'Esports roster', section: 'gaming' }],
      rosterDropped: [],
      rosterCalls: 2,
      update: [{ title: 'Dota 2 Update for October 15, 2026', summary: 'Valve released a Dota 2 update on 15 October 2026.', kicker: 'Game patch', section: 'gaming' }],
      updateDropped: [],
      updateFallback: [{ title: 'Dota 2 Update for October 15, 2026', summary: 'Valve released a Dota 2 update on 15 October 2026.', kicker: 'Game patch', section: 'gaming' }],
      updateFallbackCalls: 2,
    });
  });
});

describe('Round 3 item 5 — shared Tasmanian names need independent evidence', () => {
  it('moves the complete reviewed place list to NEEDS_COMPANION', () => {
    const moved = [
      'Waverley', 'Mayfield', 'Norwood', 'Newstead', 'St Leonards', 'Windermere',
      'Ravenswood', 'Summerhill', 'Mornington', 'Howrah', 'Rose Bay', 'Granton',
      'Berriedale', 'Otago', 'Derby', 'Gladstone', 'St Helens', 'Falmouth', 'Gawler',
      'Carrick', 'Hagley', 'Bracknell', 'Woodbridge', 'Kettering', 'Southport',
      'Currie', 'Ranelagh', 'Liffey', 'Tea Tree', 'Sassafras', 'Glengarry',
      'Invermay', 'Bushy Park', 'Seven Mile Beach', 'East Coast', 'West Coast',
      'Midlands', 'Central Highlands',
    ];
    assert.deepStrictEqual({
      inNeedsCompanion: moved.map(name => NEEDS_COMPANION.includes(name)),
      inUnambiguous: moved.map(name => UNAMBIGUOUS.includes(name)),
    }, {
      inNeedsCompanion: moved.map(() => true),
      inUnambiguous: moved.map(() => false),
    });
  });

  it('never lets one companion-required name vouch for another', () => {
    assert.deepStrictEqual(matchTasmanianPlaces('Waverley Council supported an exhibition in Perth.'), {
      unambiguous: [],
      needsCompanion: [],
      rejected: ['Perth', 'Waverley'],
      companions: [],
    });
  });

  it('routes the Bondi sculpture story to Australia without false Tasmanian evidence', () => {
    const item = {
      title: 'NSW artist becomes just fourth woman in 30 years to win major Sculpture by the Sea prize',
      description: 'The Bondi exhibition is supported by Waverley Council and also runs in Perth.',
      article_content: 'Works line the Bondi to Tamarama walk. Waverley Council supports the event, which also has a Perth exhibition.',
      sources: [{ name: 'SMH' }, { name: 'The Age' }],
      coverage: 2,
      interest_matches: [],
    };
    assert.deepStrictEqual(validateWrite({
      is_news: true,
      headline: item.title,
      summary: 'NSW artist Harrie Fasher won the major prize at the Bondi exhibition.',
      kicker: 'Art Prize',
      section: 'tasmania',
    }, item, []), {
      ok: true,
      value: {
        is_news: true,
        headline: item.title,
        summary: 'NSW artist Harrie Fasher won the major prize at the Bondi exhibition.',
        kicker: 'Art prize',
        section: 'australia',
      },
      problems: ['section moved: tasmania -> australia (no Tasmanian place named)'],
      sectionMoved: true,
    });
  });
});
