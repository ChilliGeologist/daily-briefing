'use strict';

const router = require('express').Router();

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

module.exports = function (db) {
  // --- Static routes MUST come before /:id ---

  router.put('/categories/reorder', (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids must be a non-empty array' });
      }
      db.reorderCategories(ids);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/categories/suggestions', (req, res) => {
    try {
      const suggestions = db.getActiveSuggestions();
      res.json({ suggestions });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/categories/suggestions/dismiss-all', (req, res) => {
    try {
      db.dismissAllSuggestions();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/categories/suggestions/:id/dismiss', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      db.dismissSuggestion(id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/categories/suggestions/:id/accept', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

      // Get the suggestion
      const suggestions = db.getActiveSuggestions();
      const suggestion = suggestions.find(s => s.id === id);
      if (!suggestion) return res.status(404).json({ error: 'Suggestion not found or already dismissed' });

      const name = suggestion.suggestion;
      const slug = slugify(name);

      // Find max sort_order
      const categories = db.getCategories();
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order || 0), 0);

      const catId = db.addCategory({
        slug,
        name,
        icon: 'tag',
        sort_order: maxOrder + 1,
      });

      db.dismissSuggestion(id);

      res.status(201).json({ ok: true, category: { id: catId, slug, name } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Parameterised routes ---

  router.get('/categories', (req, res) => {
    try {
      const all = db.getCategories();
      // Hide system categories from the UI unless ?all=true (used internally by pipeline)
      const categories = req.query.all === 'true' ? all : all.filter(c => c.slug !== 'other');
      res.json({ categories });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/categories', (req, res) => {
    try {
      const { name, description, icon, sort_order } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }
      const trimmed = name.trim();
      const existing = db.getCategories();
      if (existing.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
        return res.status(409).json({ error: 'A category with that name already exists' });
      }
      const slug = slugify(trimmed);
      const id = db.addCategory({ slug, name: trimmed, description, icon, sort_order });
      res.status(201).json({ id, slug, name: trimmed });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/categories/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      db.updateCategory(id, req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/categories/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      // Protect system categories
      const categories = db.getCategories();
      const cat = categories.find(c => c.id === id);
      if (cat && cat.slug === 'other') {
        return res.status(403).json({ error: 'Cannot delete the system "Other" category' });
      }
      db.deleteCategory(id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
