#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_INTERESTS } = require('../src/pipeline/writer/interests');
const { isTasmanianSource, matchTasmanianPlaces } = require('../src/pipeline/writer/tasmanian-places');

function storyText(story) {
  return [
    story.title,
    story.description,
    ...(Array.isArray(story.merged_descriptions) ? story.merged_descriptions : []),
    story.article_content,
  ].filter(value => typeof value === 'string' && value.trim()).join('\n');
}

function placeInterestTerms() {
  return DEFAULT_INTERESTS
    .filter(interest => interest.kind === 'place')
    .flatMap(interest => interest.terms);
}

function tierMatches(places) {
  return [
    ...places.unambiguous.map(name => ({ name, tier: 'UNAMBIGUOUS' })),
    ...places.needsCompanion.map(name => ({ name, tier: 'NEEDS_COMPANION' })),
  ];
}

function analyseCandidates(candidates) {
  const matched = [];
  const rejected = [];
  const unmatched = [];
  const interestTerms = placeInterestTerms();

  candidates.forEach((story, index) => {
    const places = matchTasmanianPlaces(storyText(story), interestTerms, { tasmanianSource: isTasmanianSource(story) });
    const result = {
      index: index + 1,
      title: String(story.title || ''),
      matches: tierMatches(places),
    };
    if (result.matches.length > 0) matched.push(result);
    else if (places.rejected.length > 0) rejected.push({
      ...result,
      matches: places.rejected.map(name => ({ name, tier: 'NEEDS_COMPANION' })),
    });
    else unmatched.push(result);
  });
  return { matched, rejected, unmatched };
}

function formatMatches(story) {
  return story.matches.map(({ name, tier }) => `${name} [${tier}]`).join(', ');
}

function formatReport({ matched, rejected, unmatched }) {
  return [
    'MATCHED',
    ...matched.map(story => `[${story.index}] ${formatMatches(story)} — ${story.title}`),
    '',
    'Rejected (needs a Tasmanian companion)',
    ...(rejected || []).map(story => `[${story.index}] ${formatMatches(story)} — ${story.title}`),
    '',
    'NO PLACE MATCH',
    ...unmatched.map(story => `[${story.index}] ${story.title}`),
    '',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) throw new Error('Usage: tasmania-places-report.js <candidates.json>');
  const candidatesPath = path.resolve(argv[0]);
  const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
  if (!Array.isArray(candidates)) throw new Error('Candidate file must contain a JSON array');
  process.stdout.write(formatReport(analyseCandidates(candidates)));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { analyseCandidates, formatReport, main, storyText };
