'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createSettings } = require('../src/settings');
const { createWriter, createToldWriter } = require('../src/pipeline/writer');
const {
  TOLD_SYSTEM_PROMPT,
  addToldToStories,
} = require('../src/pipeline/writer/told');
const { preWriteDropReason } = require('../src/pipeline/writer/write');
const { isCommunityHelpRequest, validateWrite } = require('../src/pipeline/writer/validate');

function response(body) {
  return {
    ok: true,
    status: 200,
    async json() { return body; },
    async text() { return ''; },
  };
}

function writerSettings(overrides = {}) {
  return {
    getOllamaUrl: () => 'http://ollama:11434',
    getWriterOllamaModel: () => 'gemma4:26b',
    getWriterNumThread: () => 7,
    getToldOllamaModel: () => 'gemma4:26b',
    getToldNumThread: () => 4,
    getOllamaNumCtx: () => 8192,
    ...overrides,
  };
}

describe('approved model and processor settings', () => {
  it('defaults and reads the writer processor cap', () => {
    const values = {};
    const db = {
      getSetting: key => values[key] ?? null,
      setSetting: (key, value) => { values[key] = value; },
    };
    assert.deepStrictEqual({
      writerModel: createSettings(db).getWriterOllamaModel(),
      toldModel: createSettings(db).getToldOllamaModel(),
      writerThreads: createSettings(db).getWriterNumThread(),
      toldThreads: createSettings(db).getToldNumThread(),
    }, {
      writerModel: 'gemma4:26b',
      toldModel: 'gemma4:26b',
      writerThreads: 4,
      toldThreads: 4,
    });
    values.writer_num_thread = 6;
    assert.strictEqual(createSettings(db).getWriterNumThread(), 6);
  });

  it('puts the configured processor cap in every writer, editor, vision and told request', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      if (url === 'https://images.test/photo.jpg') {
        return { ok: true, async arrayBuffer() { return Buffer.from('image'); } };
      }
      calls.push(JSON.parse(options.body));
      return response({ message: { content: '{}' } });
    };
    const writer = createWriter(writerSettings(), {}, { fetchImpl });
    const toldWriter = createToldWriter(writerSettings(), {}, { fetchImpl });
    const schema = { type: 'object' };

    await writer.write('system', 'write', schema);
    await writer.edit('system', 'edit', schema);
    await writer.vision('system', 'vision', schema, 'https://images.test/photo.jpg');
    await writer.tell('system', 'fallback told', schema);
    await toldWriter.tell('system', 'told', schema);

    assert.deepStrictEqual(calls.map(call => call.options), [
      { temperature: 0.3, num_ctx: 8192, num_predict: 700, num_thread: 7 },
      { temperature: 0.3, num_ctx: 8192, num_predict: 1500, num_thread: 7 },
      { temperature: 0.3, num_ctx: 8192, num_predict: 700, num_thread: 7 },
      { temperature: 0.3, num_ctx: 8192, num_predict: 1200, num_thread: 7 },
      { temperature: 0.3, num_ctx: 8192, num_predict: 1200, num_thread: 4 },
    ]);
  });
});

function toldStory({ outlet, headline, opening, subject, kind = 'person', stance = 'against', quote }) {
  return {
    title: headline,
    outlet_versions: [
      { name: outlet, headline, text: opening, url: `https://${outlet.toLowerCase().replace(/\W+/g, '')}.test/story` },
      { name: 'Wire', headline: `${subject} in the news`, text: 'The wire service plainly reported the development.', url: 'https://wire.test/story' },
    ],
    raw: { subjects: [{
      name: subject,
      kind,
      stances: [
        { outlet, stance, quote },
        { outlet: 'Wire', stance: 'plain', quote: '' },
      ],
    }] },
  };
}

async function runToldCase(spec, verification) {
  const story = toldStory(spec);
  const calls = [];
  const answers = [story.raw, verification];
  await addToldToStories([story], {
    name: 'fake:told',
    concurrency: 1,
    async tell(system, user, schema, numPredict) {
      calls.push({ system, user, schema, numPredict });
      return { json: answers.shift() };
    },
  }, null, { warn() {} });
  return { story, calls };
}

describe('how it was told second check', () => {
  it('states the complete subject exclusions in the first prompt', () => {
    assert.match(TOLD_SYSTEM_PROMPT, /subjects? must be a person, political party, organisation, government or (?:a )?cause/i);
    assert.match(TOLD_SYSTEM_PROMPT, /never an event, accident, disaster, animal, object or crowd/i);
  });

  it('turns the Al Jazeera movement description into plain and sends the exact check inputs', async () => {
    const spec = {
      outlet: 'Al Jazeera',
      headline: 'No Kings network opposed to United States President Donald Trump',
      opening: 'The No Kings network is organising protests against the president.',
      subject: 'Donald Trump',
      quote: 'opposed to United States President Donald Trump',
    };
    const { story, calls } = await runToldCase(spec, { a: 'yes', b: 'no', c: 'against' });
    assert.deepStrictEqual(story.told, {
      outlets: story.outlet_versions.map(({ name, headline, url }) => ({ name, headline, url })),
      subjects: [{
        name: 'Donald Trump',
        kind: 'person',
        stances: [
          { outlet: 'Al Jazeera', stance: 'plain', quote: '' },
          { outlet: 'Wire', stance: 'plain', quote: '' },
        ],
      }],
      differs: false,
    });
    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(calls[1], {
      system: 'Verify one proposed outlet stance. Answer each field exactly as requested.',
      user: `Outlet: Al Jazeera. Its own words: No Kings network opposed to United States President Donald Trump
The No Kings network is organising protests against the president. Phrase: "opposed to United States President Donald Trump". Subject: Donald Trump.
a) Is Donald Trump a person, political party, organisation, government, or a cause with real supporters and opponents (a policy or position)? Not an event, accident, disaster, animal, object or crowd, and not a crime, its motive or a harm nobody defends, such as racism or terrorism. (yes/no)
b) In this phrase is the outlet itself expressing a view about Donald Trump, through its own word choice, rather than describing someone else's position or plainly reporting what happened? (yes/no)
c) If yes, which way: toward (favourable or sympathetic to Donald Trump) or against (unfavourable or critical)?`,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['a', 'b', 'c'],
        properties: {
          a: { type: 'string', enum: ['yes', 'no'] },
          b: { type: 'string', enum: ['yes', 'no'] },
          c: { type: 'string', enum: ['toward', 'against'] },
        },
      },
      numPredict: 80,
    });
  });

  it('drops invalid event and animal subjects after a no answer', async () => {
    const cases = [
      {
        outlet: 'Daily News', headline: 'Devastating fire rips through warehouse',
        opening: 'Crews contained the blaze overnight.', subject: 'The fire incident', kind: 'cause',
        quote: 'devastating fire rips through',
      },
      {
        outlet: 'Racing News', headline: 'Ohope Wins suffers tragic fall',
        opening: 'The racehorse fell during the final race.', subject: 'Ohope Wins', kind: 'person',
        quote: 'tragic fall',
      },
    ];
    const results = [];
    for (const spec of cases) {
      const { story } = await runToldCase(spec, { a: 'no', b: 'yes', c: 'against' });
      results.push(story.told);
    }
    assert.deepStrictEqual(results, cases.map((_, index) => ({
      outlets: toldStory(cases[index]).outlet_versions.map(({ name, headline, url }) => ({ name, headline, url })),
    })));
  });

  it('turns plain reporting and failed checks into plain, then recomputes differs', async () => {
    const reported = await runToldCase({
      outlet: 'World News', headline: 'Campaigners put pressure on governments across the European Union',
      opening: 'The campaign called for ministers to act.', subject: 'European Union governments', kind: 'government',
      quote: 'put pressure on governments across the European Union',
    }, { a: 'yes', b: 'no', c: 'against' });

    const failedSpec = {
      outlet: 'Example', headline: 'Leader faces sharp attack', opening: 'The outlet called the decision cruel.',
      subject: 'Leader', quote: 'sharp attack',
    };
    const failedStory = toldStory(failedSpec);
    const answers = [failedStory.raw];
    await addToldToStories([failedStory], {
      name: 'fake:told', concurrency: 1,
      async tell() {
        const answer = answers.shift();
        if (!answer) throw new Error('verification unavailable');
        return { json: answer };
      },
    }, null, { warn() {} });

    assert.deepStrictEqual([
      reported.story.told.subjects[0].stances,
      reported.story.told.differs,
      failedStory.told.subjects[0].stances,
      failedStory.told.differs,
    ], [
      [
        { outlet: 'World News', stance: 'plain', quote: '' },
        { outlet: 'Wire', stance: 'plain', quote: '' },
      ],
      false,
      [
        { outlet: 'Example', stance: 'plain', quote: '' },
        { outlet: 'Wire', stance: 'plain', quote: '' },
      ],
      false,
    ]);
  });

  it('keeps the SBS and 7NEWS stances only when all three answers agree', async () => {
    const cases = [
      {
        outlet: 'SBS', headline: 'Trump escalated a battle with Zelenskyy',
        opening: 'The dispute followed failed talks.', subject: 'Donald Trump',
        quote: 'escalated a battle with Zelenskyy',
      },
      {
        outlet: '7NEWS', headline: 'Killers given whopping sentences',
        opening: 'The two killers were sentenced on Monday.', subject: 'The killers',
        quote: 'Killers given whopping sentences',
      },
    ];
    const results = [];
    for (const spec of cases) {
      const { story } = await runToldCase(spec, { a: 'yes', b: 'yes', c: 'against' });
      results.push(story.told);
    }
    assert.deepStrictEqual(results, cases.map((spec, index) => ({
      outlets: toldStory(spec).outlet_versions.map(({ name, headline, url }) => ({ name, headline, url })),
      subjects: [{
        name: spec.subject,
        kind: 'person',
        stances: [
          { outlet: spec.outlet, stance: 'against', quote: spec.quote },
          { outlet: 'Wire', stance: 'plain', quote: '' },
        ],
      }],
      differs: true,
    })));
  });

  it('makes exactly one verification call per non-plain stance and rejects a direction mismatch', async () => {
    const story = {
      title: 'Leader coverage differs',
      outlet_versions: [
        { name: 'One', headline: 'Leader suffers humiliating retreat', text: 'The leader abandoned the plan.', url: 'https://one.test/story' },
        { name: 'Two', headline: 'Brave leader holds firm', text: 'The leader kept the plan.', url: 'https://two.test/story' },
        { name: 'Wire', headline: 'Leader retains plan', text: 'The plan remains in place.', url: 'https://wire.test/story' },
      ],
    };
    const answers = [
      { subjects: [{
        name: 'Leader', kind: 'person', stances: [
          { outlet: 'One', stance: 'against', quote: 'humiliating retreat' },
          { outlet: 'Two', stance: 'toward', quote: 'Brave leader' },
          { outlet: 'Wire', stance: 'plain', quote: '' },
        ],
      }] },
      { a: 'yes', b: 'yes', c: 'toward' },
      { a: 'yes', b: 'yes', c: 'toward' },
    ];
    const calls = [];
    await addToldToStories([story], {
      name: 'fake:told', concurrency: 1,
      async tell(system, user, schema, numPredict) {
        calls.push({ system, user, schema, numPredict });
        return { json: answers.shift() };
      },
    });

    assert.deepStrictEqual({
      callCount: calls.length,
      verificationPredictions: calls.slice(1).map(call => call.numPredict),
      told: story.told,
    }, {
      callCount: 3,
      verificationPredictions: [80, 80],
      told: {
        outlets: story.outlet_versions.map(({ name, headline, url }) => ({ name, headline, url })),
        subjects: [{
          name: 'Leader', kind: 'person', stances: [
            { outlet: 'One', stance: 'plain', quote: '' },
            { outlet: 'Two', stance: 'toward', quote: 'Brave leader' },
            { outlet: 'Wire', stance: 'plain', quote: '' },
          ],
        }],
        differs: true,
      },
    });
  });
});

describe('deterministic source guards', () => {
  it('treats how-to title forms as help only for Reddit self posts', () => {
    const selfPost = title => ({ title, source_type: 'reddit', source_name: 'r/selfhosted' });
    assert.deepStrictEqual([
      isCommunityHelpRequest(selfPost('How to deploy a SSL certificate (wildcard) across multiple hosts?')),
      isCommunityHelpRequest(selfPost('How do you deploy certificates across multiple hosts?')),
      isCommunityHelpRequest(selfPost('How can I deploy certificates across multiple hosts?')),
      isCommunityHelpRequest({ ...selfPost('How to deploy a SSL certificate'), external_url: 'https://example.test/guide' }),
    ], [true, true, true, false]);
  });

  it('drops live-prefixed pages before writing', () => {
    const base = {
      article_content: Array(180).fill('word').join(' '),
      sources: [{ name: 'ABC News' }],
    };
    assert.deepStrictEqual([
      preWriteDropReason({ ...base, title: 'Live: Former A-G named as next anti-corruption watchdog boss' }),
      preWriteDropReason({ ...base, title: 'LIVE: Election count continues' }),
      preWriteDropReason({ ...base, title: 'Former A-G named as next anti-corruption watchdog boss' }),
    ], ['live blog', 'live blog', null]);
  });

  it('preserves known region and place casing in sentence-case kickers', () => {
    const cases = [
      ['Middle East Politics', 'Middle east politics are changing.', 'Middle East politics'],
      ['East Africa Trade', 'Trade is changing across east africa.', 'East Africa trade'],
      ['Port Sorell Council', 'The council met in port sorell.', 'Port Sorell council'],
      ['New Delhi Transport', 'Transport changed in new delhi.', 'New Delhi transport'],
      ['Asia-Pacific Security', 'Security talks cover the asia-pacific.', 'Asia-Pacific security'],
    ];
    assert.deepStrictEqual(cases.map(([kicker, description]) => validateWrite({
      is_news: true,
      headline: 'Officials confirm the change',
      summary: description,
      kicker,
      section: 'world',
    }, {
      title: 'Officials confirm the change',
      description,
    }, []).value.kicker), cases.map(([, , expected]) => expected));
  });
});
