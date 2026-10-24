#!/usr/bin/env node
'use strict';

// Pre-handover check of a real briefing, run inside the dev container:
//   node scripts/self-check.js            (reads http://localhost:3100/api/briefing)
//   node scripts/self-check.js file.json  (a saved /api/briefing payload)
// Prints every problem a reader would notice, so the build is not handed over
// with bare titles, thin sections or claimed fixes that never reached the page.

const fs = require('fs');

const MIN_SECTION = 4;
const COMMUNITY = /^(?:r\/|hacker news)/i;

async function load() {
  const file = process.argv[2];
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const response = await fetch('http://localhost:3100/api/briefing');
  return response.json();
}

function words(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

(async () => {
  const payload = await load();
  const data = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data;
  const problems = [];
  const seen = new Map();
  let total = 0;

  console.log(`Edition ${payload.date}`);
  for (const section of data.sections || []) {
    const stories = [...(section.items || []), ...(section.more || [])];
    total += stories.length;
    const sources = new Set(stories.flatMap(story => (story.sources || []).map(source => source.name)));
    console.log(`  ${section.title}: ${stories.length} stories from ${sources.size} sources`);
    if (section.id !== 'top' && stories.length < MIN_SECTION) {
      problems.push(`thin section: ${section.title} has ${stories.length} stories`);
    }
    for (const story of stories) {
      const title = story.title || '(no title)';
      if (!String(story.summary || '').trim()) problems.push(`no summary: ${title}`);
      const summaryWords = words(story.summary).length;
      if (summaryWords > 45) problems.push(`summary over 45 words (${summaryWords}): ${title}`);
      const kickerWords = words(story.kicker);
      if (kickerWords.length > 1 && kickerWords.slice(1).every(word => /^[A-Z][a-z]/.test(word))) {
        problems.push(`Title Case kicker "${story.kicker}": ${title}`);
      }
      if (words(title).length <= 3) problems.push(`vague headline: ${title}`);
      const names = (story.sources || []).map(source => source.name || '');
      const communityOnly = names.length > 0 && names.every(name => COMMUNITY.test(name));
      if (communityOnly && /\?\s*$/.test(title)) {
        const replies = (story.top_comments || []).length;
        if (replies < 2) problems.push(`question with ${replies} replies kept: ${title}`);
      }
      if (communityOnly && section.id === 'top') problems.push(`Reddit/HN-only story in You should know: ${title}`);
      if (section.id !== 'top') {
        const key = title.toLowerCase();
        if (seen.has(key)) problems.push(`duplicate headline in ${seen.get(key)} and ${section.title}: ${title}`);
        else seen.set(key, section.title);
      }
    }
  }
  console.log(`  ${total} stories in all`);
  console.log(problems.length ? `\n${problems.length} problem(s):` : '\nNo problems found.');
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = problems.length ? 1 : 0;
})().catch(error => {
  console.error(error.message);
  process.exitCode = 2;
});
