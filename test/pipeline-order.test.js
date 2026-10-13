'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { saveCandidates } = require('../src/pipeline');

it('runs the pipeline stages in the specified order', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pipeline/index.js'), 'utf8');
  const stages = [...source.matchAll(/emit\(\{ type: 'stage', stage: '([^']+)', status: 'running' \}\)/g)]
    .map(match => match[1]);

  assert.deepStrictEqual(stages, [
    'collect', 'filter', 'cluster', 'rank', 'extract', 'write', 'edit', 'assemble',
  ]);
  assert.strictEqual(source.includes("require('./categoriser')"), false);
  assert.strictEqual(source.includes("require('./summariser')"), false);
  assert.strictEqual(source.includes('limit: settings.getMaxCandidates(),'), true);
  assert.strictEqual(source.includes('limit: settings.getMaxCuratedItems(),'), false);
});

it('saves candidate arrays with article text and retains the newest seven files', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-gump-candidates-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (let index = 0; index < 7; index++) {
    const file = path.join(dir, `2026-10-0${index + 1}-old0000${index}.json`);
    fs.writeFileSync(file, '[]');
    const when = new Date(`2026-10-0${index + 1}T00:00:00Z`);
    fs.utimesSync(file, when, when);
  }
  const candidates = [{ title: 'Candidate', article_content: 'Full article text', coverage: 2 }];

  const saved = await saveCandidates(candidates, {
    candidatesDir: dir,
    briefingDate: '2026-10-13',
    runId: '12345678-abcd-efgh',
  });

  assert.strictEqual(saved, path.join(dir, '2026-10-13-12345678.json'));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(saved, 'utf8')), candidates);
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), [
    '2026-10-02-old00001.json',
    '2026-10-03-old00002.json',
    '2026-10-04-old00003.json',
    '2026-10-05-old00004.json',
    '2026-10-06-old00005.json',
    '2026-10-07-old00006.json',
    '2026-10-13-12345678.json',
  ]);
});

it('shows write and edit in the status-page stage metadata', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  function sourceValue(name) {
    const array = source.match(new RegExp(`var ${name} = (\\[[^;]+\\]);`));
    const object = source.match(new RegExp(`var ${name} = (\\{[\\s\\S]*?\\n\\});`));
    return Function(`"use strict"; return ${array ? array[1] : object[1]};`)();
  }
  const patterns = sourceValue('STAGE_COMPLETE_PATTERNS');

  assert.deepStrictEqual(sourceValue('PIPELINE_STAGES'), [
    'Collect', 'Filter', 'Cluster', 'Rank', 'Extract', 'Write', 'Edit', 'Assemble',
  ]);
  assert.deepStrictEqual(sourceValue('STAGE_DESCRIPTIONS'), {
    collect: 'Collecting items from configured sources',
    filter: 'Dropping old news and filler',
    cluster: 'Grouping the same story from different outlets',
    rank: 'Choosing the stories worth writing up',
    extract: 'Fetching the full articles',
    write: 'Writing stories',
    edit: 'Choosing what matters',
    assemble: 'Assembling the final briefing',
  });
  assert.deepStrictEqual(Object.fromEntries(Object.entries(patterns).map(([key, value]) => [key, String(value)])), {
    collect: '/^Collection complete:/',
    filter: '/^Filtered \\d+ items:/' ,
    cluster: '/^Clustered \\d+ items/',
    rank: '/^Ranked \\d+ stories:/' ,
    extract: '/^Extracted \\d+ stories:/' ,
    write: '/^Wrote \\d+ stories/',
    edit: '/^Edited: \\d+ top, \\d+ in sections/',
    assemble: '/^Assembled briefing:/' ,
  });
  assert.deepStrictEqual(sourceValue('STAGE_COMPLETE_COMPONENTS'), {
    collect: 'collector',
    filter: 'pipeline:filter',
    cluster: 'pipeline:cluster',
    rank: 'pipeline:rank',
    extract: 'pipeline:extract',
    write: 'pipeline:writer',
    edit: 'pipeline:editor',
    assemble: 'assembler',
  });
});
