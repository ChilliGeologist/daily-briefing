#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { initDB } = require('../src/db');
const { createSettings } = require('../src/settings');
const { createOllamaWriter } = require('../src/pipeline/writer/ollama');
const { writeStories } = require('../src/pipeline/writer/write');
const { editStories } = require('../src/pipeline/writer/edit');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDuration(durationMs) {
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)} s` : `${durationMs} ms`;
}

function metrics(stats) {
  return [
    countLabel(stats.written || 0, 'written', 'written'),
    countLabel(stats.failures || 0, 'failure'),
    countLabel(stats.not_news || 0, 'not-news', 'not-news'),
    `${stats.input_tokens || 0} input / ${stats.output_tokens || 0} output tokens`,
    formatDuration(stats.duration_ms || 0),
  ].join(' · ');
}

function renderStory(story, className) {
  return `<article class="${className}"><div class="kicker">${escapeHtml(story.kicker)}</div><div class="headline">${escapeHtml(story.headline)}</div><div class="summary">${escapeHtml(story.summary)}</div><div class="detail">${escapeHtml(story.detail)}</div></article>`;
}

function storyMaps(result) {
  return {
    stories: new Map((result.stories || []).map(story => [story.id, story])),
    dropped: new Map((result.dropped || []).map(story => [story.id, story])),
  };
}

function buildCompareHtml(results) {
  const originals = results[0] ? (results[0].originals || []) : [];
  const maps = results.map(storyMaps);
  const headers = results.map(result => `<section class="writer-header"><h2>${escapeHtml(result.name)}</h2><div class="metrics">${escapeHtml(metrics(result.stats || {}))}</div>${result.error ? `<div class="writer-error">Failure: ${escapeHtml(result.error)}</div>` : ''}</section>`).join('');
  const topColumns = results.map((result, index) => {
    const cards = (result.top || []).map(id => maps[index].stories.get(id))
      .filter(story => story && story.write_ok !== false)
      .map(story => renderStory(story, 'story-card'))
      .join('');
    return `<section class="top-column"><h3>${escapeHtml(result.name)}</h3>${cards || '<div class="empty">No top picks</div>'}</section>`;
  }).join('');
  const rows = originals.map(original => {
    const cells = results.map((result, index) => {
      const story = maps[index].stories.get(original.id);
      const dropped = maps[index].dropped.get(original.id);
      let content;
      if (dropped) content = '<div class="missing">Not news</div>';
      else if (!story || story.write_ok === false) content = '<div class="missing">Failed</div>';
      else content = renderStory(story, 'story-copy');
      return `<div class="story-cell"><h4>${escapeHtml(result.name)}</h4>${content}</div>`;
    }).join('');
    return `<section class="story-row"><h3 class="original-title">${escapeHtml(original.title)}</h3><div class="story-columns">${cells}</div></section>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Writer comparison</title>
<style>
:root{color-scheme:light dark;--paper:#fbf6e9;--ink:#24211d;--muted:#6d665c;--line:#cfc5b2;--accent:#9a3f27;--panel:#fffaf0}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 Georgia,serif}main{max-width:1400px;margin:auto;padding:1rem}h1,h2,h3,h4{line-height:1.15}.writer-grid,.top-grid,.story-columns{display:grid;grid-template-columns:repeat(var(--writers),minmax(0,1fr));gap:1rem}.writer-header,.top-column,.story-cell{min-width:0;padding:1rem;background:var(--panel);border:1px solid var(--line);border-radius:.4rem}.metrics,.kicker,.empty,.missing{color:var(--muted);font-family:system-ui,sans-serif;font-size:.85rem}.writer-error{margin-top:.6rem;color:#b3261e;font-weight:bold}.story-card,.story-copy{margin:.75rem 0}.headline{font-size:1.15rem;font-weight:bold}.summary{margin-top:.35rem}.detail{margin-top:.5rem;color:var(--muted)}.story-row{padding:1rem 0;border-top:1px solid var(--line)}.original-title{color:var(--accent)}.story-cell h4{display:none}@media(max-width:700px){.writer-grid,.top-grid,.story-columns{display:block}.writer-header,.top-column,.story-cell{margin-bottom:.8rem}.story-cell h4{display:block}.writer-header h2,.top-column h3{overflow-wrap:anywhere}}@media(prefers-color-scheme:dark){:root{--paper:#1d1b18;--ink:#eee8db;--muted:#bcb3a5;--line:#4f493f;--accent:#e18a6c;--panel:#28241f}}
</style>
</head>
<body>
<main style="--writers:${Math.max(1, results.length)}"><h1>Writer comparison</h1><div class="writer-grid">${headers}</div><h2>You should know</h2><div class="top-grid">${topColumns}</div><h2>Every story</h2>${rows}</main>
</body>
</html>`;
}

function parseArgs(argv) {
  const args = { candidates: argv[0], writers: [], limit: null, out: null, db: null };
  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index];
    const value = argv[++index];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === '--writer') args.writers.push(value);
    else if (flag === '--limit') args.limit = Number(value);
    else if (flag === '--out') args.out = value;
    else if (flag === '--db') args.db = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!args.candidates) throw new Error('Usage: compare-writers.js <candidates.json> --writer <writer> [--writer <writer>]');
  if (args.writers.length === 0) throw new Error('At least one --writer is required');
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) throw new Error('--limit must be a positive integer');
  return args;
}

function makeWriter(spec, settings) {
  if (spec.startsWith('ollama:')) {
    const model = spec.slice('ollama:'.length);
    if (!model) throw new Error(`Invalid writer: ${spec}`);
    return createOllamaWriter({
      url: settings.getOllamaUrl(),
      model,
      numCtx: settings.getOllamaNumCtx(),
    });
  }
  throw new Error(`Writer must use ollama:<model>: ${spec}`);
}

async function runWriter(spec, candidates, settings) {
  const backend = makeWriter(spec, settings);
  const quietLog = { info() {}, warn() {} };
  const written = await writeStories(candidates, backend, settings, quietLog);
  const edited = await editStories(written.stories, backend, settings, quietLog);
  const originals = candidates.map((candidate, index) => ({ id: `s${index + 1}`, title: candidate.title || '' }));
  return {
    name: backend.name,
    originals,
    stories: written.stories,
    dropped: written.dropped,
    top: edited.top,
    stats: {
      written: written.stories.filter(story => story.write_ok).length,
      failures: written.stats.fallbacks,
      not_news: written.stats.not_news,
      input_tokens: written.stats.input_tokens + edited.stats.input_tokens,
      output_tokens: written.stats.output_tokens + edited.stats.output_tokens,
      duration_ms: written.stats.duration_ms + edited.stats.duration_ms,
    },
    error: null,
  };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = path.join(__dirname, '..');
  const dbPath = path.resolve(args.db || path.join(root, 'data/briefings.db'));
  const candidatesPath = path.resolve(args.candidates);
  const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
  if (!Array.isArray(candidates)) throw new Error('Candidate file must contain a JSON array');
  const selected = args.limit === null ? candidates : candidates.slice(0, args.limit);
  const originals = selected.map((candidate, index) => ({ id: `s${index + 1}`, title: candidate.title || '' }));
  const db = initDB(dbPath);
  const settings = createSettings(db);
  const results = [];
  try {
    for (const spec of args.writers) {
      try {
        results.push(await runWriter(spec, selected, settings));
      } catch (error) {
        results.push({
          name: spec,
          originals,
          stories: [],
          dropped: [],
          top: [],
          stats: { written: 0, failures: selected.length, not_news: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
          error: error.message,
        });
      }
    }
  } finally {
    db.raw.close();
  }
  const outputPath = path.resolve(args.out || path.join(
    path.dirname(candidatesPath),
    `${path.basename(candidatesPath, path.extname(candidatesPath))}-writers.html`
  ));
  fs.writeFileSync(outputPath, buildCompareHtml(results));
  process.stdout.write(`${outputPath}\n`);
  return outputPath;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { buildCompareHtml, escapeHtml, parseArgs, main };
