'use strict';

const router = require('express').Router();

module.exports = function (ollamaClient, settings) {
  router.get('/ollama/models', async (req, res) => {
    try {
      const models = await ollamaClient.listModels(settings.getOllamaUrl());
      res.json({ models });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/ollama/test', async (req, res) => {
    try {
      const result = await ollamaClient.testConnection(settings.getOllamaUrl());
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/ollama/preview', async (req, res) => {
    try {
      const { title, description } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });

      const preferences = settings.getPreferences();

      const prompt = `You are a news editor. Rewrite and summarise this article for a daily briefing.

Style: ${preferences.tone}. Language: ${preferences.language}.

Original headline: ${title}
Sources: Preview
Content:
${description || ''}

Respond in this exact JSON format (no markdown, no code blocks):
{"title":"Clear, informative rewritten headline","summary":"One sentence key takeaway","detail":"2-5 sentence synthesis. For multi-source stories, note key differences.","significance":"high|medium|low"}`;

      const start = Date.now();
      const result = await ollamaClient.generate(
        settings.getOllamaUrl(), settings.getOllamaModel(), prompt, { temperature: 0.3 }
      );
      const duration_ms = Date.now() - start;

      // Parse the response
      let parsed;
      try {
        parsed = JSON.parse(result.response);
      } catch (_) {
        const match = result.response.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch (_) { /* ignore */ }
        }
      }

      if (parsed && parsed.title) {
        res.json({
          title: parsed.title,
          summary: parsed.summary,
          detail: parsed.detail,
          significance: parsed.significance,
          duration_ms,
          tokens: result.tokens,
        });
      } else {
        res.json({
          title: title,
          summary: result.response.substring(0, 200),
          detail: result.response,
          significance: 'medium',
          duration_ms,
          tokens: result.tokens,
        });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
