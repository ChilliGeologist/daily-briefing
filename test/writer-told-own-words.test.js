'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  TOLD_SCHEMA,
  TOLD_SYSTEM_PROMPT,
  buildTold,
  outletOwnWords,
  toldUserPrompt,
} = require('../src/pipeline/writer/told');

describe('how it was told — outlet own words', () => {
  const abc = {
    name: 'ABC',
    headline: 'Minister responds to attacks on Palestinian olive harvest',
    description: 'Description must not be used while article text is available.',
    url: 'https://abc.test/olive-harvest',
    text: 'As the occupying power, "Israeli authorities must protect Palestinians", the minister said. Officials discussed the attacks overnight. Harvesting resumed on Monday.',
  };
  const guardian = {
    name: 'Guardian',
    headline: 'Settlers attack diplomats during Palestinian olive harvest',
    description: 'A fallback description.',
    url: 'https://guardian.test/olive-harvest',
    text: 'Settlers attacked the diplomats in the latest violent attempt to prevent Palestinians from harvesting olives on their own land. Diplomats returned to the area later. A third sentence is outside the opening.',
  };

  it('removes attributed quoted sentences before selecting the first two opening sentences', () => {
    assert.deepStrictEqual(outletOwnWords(abc), {
      headline: 'Minister responds to attacks on Palestinian olive harvest',
      opening: 'Officials discussed the attacks overnight. Harvesting resumed on Monday.',
    });
    assert.deepStrictEqual(outletOwnWords(guardian), {
      headline: 'Settlers attack diplomats during Palestinian olive harvest',
      opening: 'Settlers attacked the diplomats in the latest violent attempt to prevent Palestinians from harvesting olives on their own land. Diplomats returned to the area later.',
    });
  });

  it('replaces a headline quotation and preserves apostrophes in ordinary words', () => {
    assert.deepStrictEqual(outletOwnWords({
      headline: "'It was an honour': Katie Zacharia breaks silence after White House firing",
      text: "Australia's officials don't expect delays. Travellers won't need new documents.",
    }), {
      headline: '[quote]: Katie Zacharia breaks silence after White House firing',
      opening: "Australia's officials don't expect delays. Travellers won't need new documents.",
    });
  });

  it('strips straight and curly quotes but leaves one- or two-word single quotes', () => {
    assert.deepStrictEqual(outletOwnWords({
      headline: `Leader calls warning “a grave mistake” but keeps 'brief phrase'`,
      text: `Australia’s officials don’t repeat ‘three quoted words’ or "another quoted passage". Work continues. A third sentence is omitted.`,
    }), {
      headline: `Leader calls warning [quote] but keeps 'brief phrase'`,
      opening: `Australia’s officials don’t repeat [quote] or [quote]. Work continues.`,
    });
  });

  it('falls back to description only when text is absent and sends no description or text fields', () => {
    const fallback = {
      name: 'Fallback News',
      headline: 'Update issued',
      description: 'The first fallback sentence. The second fallback sentence. The third is omitted.',
      text: '   ',
    };
    assert.deepStrictEqual(outletOwnWords(fallback), {
      headline: 'Update issued',
      opening: 'The first fallback sentence. The second fallback sentence.',
    });
    assert.strictEqual(toldUserPrompt({ headline: 'Olive harvest' }, [abc, guardian]), `STORY: Olive harvest

OUTLET 1: ABC
HEADLINE: Minister responds to attacks on Palestinian olive harvest
OPENING: Officials discussed the attacks overnight. Harvesting resumed on Monday.

OUTLET 2: Guardian
HEADLINE: Settlers attack diplomats during Palestinian olive harvest
OPENING: Settlers attacked the diplomats in the latest violent attempt to prevent Palestinians from harvesting olives on their own land. Diplomats returned to the area later.`);
  });

  it('rejects a stance quote found only in a stripped sentence', () => {
    const raw = { subjects: [{
      name: 'Palestinians',
      kind: 'cause',
      stances: [
        { outlet: 'ABC', stance: 'toward', quote: 'As the occupying power' },
        { outlet: 'Guardian', stance: 'toward', quote: 'prevent Palestinians from harvesting olives' },
      ],
    }] };
    assert.deepStrictEqual(buildTold([abc, guardian], raw), {
      outlets: [
        { name: 'ABC', headline: abc.headline, url: abc.url },
        { name: 'Guardian', headline: guardian.headline, url: guardian.url },
      ],
    });
  });

  it('tells the model to judge only the quote-stripped headline and opening', () => {
    assert.match(TOLD_SYSTEM_PROMPT, /headline and opening only/i);
    assert.match(TOLD_SYSTEM_PROMPT, /quotes removed/i);
    assert.match(TOLD_SYSTEM_PROMPT, /own word choice/i);
    assert.match(TOLD_SYSTEM_PROMPT, /chose to lead with/i);
    assert.match(TOLD_SYSTEM_PROMPT, /plain.+(?:empty|omit)/i);
    assert.deepStrictEqual(TOLD_SCHEMA.properties.subjects.items.properties.stances.items.required, [
      'outlet', 'stance',
    ]);
  });

  it('keeps the Trump subject when plain outlets have no quote', () => {
    const versions = [
      { name: 'SBS', headline: 'Trump escalates battle with Zelenskyy', text: 'Donald Trump escalated a battle with Zelenskyy over the failed talks.', url: 'https://sbs.test/trump' },
      { name: 'AP', headline: 'Trump and Zelenskyy clash over talks', text: 'The two presidents disagreed over the next step.', url: 'https://ap.test/trump' },
      { name: 'Reuters', headline: 'Trump, Zelenskyy differ over peace plan', text: 'Their disagreement followed a meeting.', url: 'https://reuters.test/trump' },
      { name: 'The Australian', headline: 'Trump disputes Zelenskyy account', text: 'The leaders offered different accounts.', url: 'https://theaustralian.test/trump' },
    ];
    const raw = { subjects: [{
      name: 'Donald Trump',
      kind: 'person',
      stances: [
        { outlet: 'SBS', stance: 'against', quote: 'escalated a battle with Zelenskyy' },
        { outlet: 'AP', stance: 'plain', quote: '' },
        { outlet: 'Reuters', stance: 'plain' },
        { outlet: 'The Australian', stance: 'plain', quote: '' },
      ],
    }] };

    assert.deepStrictEqual(buildTold(versions, raw), {
      outlets: versions.map(({ name, headline, url }) => ({ name, headline, url })),
      subjects: [{
        name: 'Donald Trump',
        kind: 'person',
        stances: [
          { outlet: 'SBS', stance: 'against', quote: 'escalated a battle with Zelenskyy' },
          { outlet: 'AP', stance: 'plain', quote: '' },
          { outlet: 'Reuters', stance: 'plain', quote: '' },
          { outlet: 'The Australian', stance: 'plain', quote: '' },
        ],
      }],
      differs: true,
    });
  });

  it('still rejects toward and against stances without a quote', () => {
    const versions = [
      { name: 'One', headline: 'Leader praised by outlet', text: 'The leader won broad praise.', url: 'https://one.test/story' },
      { name: 'Two', headline: 'Leader criticised by outlet', text: 'The leader faced sharp criticism.', url: 'https://two.test/story' },
      { name: 'Three', headline: 'Leader gives update', text: 'The leader spoke on Monday.', url: 'https://three.test/story' },
    ];
    const raw = { subjects: [{
      name: 'The leader',
      kind: 'person',
      stances: [
        { outlet: 'One', stance: 'toward', quote: '' },
        { outlet: 'Two', stance: 'against' },
        { outlet: 'Three', stance: 'plain', quote: '' },
      ],
    }] };

    assert.deepStrictEqual(buildTold(versions, raw), {
      outlets: versions.map(({ name, headline, url }) => ({ name, headline, url })),
    });
  });
});
