'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const candidates = require('./fixtures/stage7-saved-candidates.json');
const settingsRoutes = require('../src/routes/settings');

test('Try it matches a real saved candidate and the latest edition without duplicates', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-gump-interests-'));
  fs.writeFileSync(path.join(dir, '2026-10-24-real.json'), JSON.stringify(candidates.candidates));
  const db = {
    getSetting: () => null,
    getLatestBriefing: () => ({
      id: 42,
      date: '2026-10-25',
      data: { sections: [{ id: 'tech', title: 'Tech & Security', items: [{
        id: 'edition-openai',
        title: 'OpenAI changes model training',
        summary: 'Internet access is disabled during model training.',
        sources: [{ name: 'The Register', url: 'https://example.test/openai' }],
      }], more: [] }] },
    }),
  };
  const settings = { getAll: () => ({}), set() {} };
  const scheduler = { refreshSchedule() {} };
  const app = express();
  app.use(express.json());
  app.use('/api', settingsRoutes(db, settings, scheduler, { candidatesDir: dir }));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/interests/try`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      label: 'OpenAI', kind: 'topic', terms: ['OpenAI'], weight: 2,
      urgent: false, requires_place: false,
    }),
  });
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), {
    matches: [
      {
        origin: 'today\'s paper',
        id: 'edition-openai',
        title: 'OpenAI changes model training',
        source: 'The Register',
        url: 'https://example.test/openai',
        terms: ['OpenAI'],
      },
      {
        origin: 'latest candidates',
        id: 'openai-training',
        title: 'OpenAI disables internet access during model training while Anthropic issues another mea culpa',
        source: 'The Register',
        url: '',
        terms: ['OpenAI'],
      },
    ],
  });
});
