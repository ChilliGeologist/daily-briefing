'use strict';

const SIGNIFICANCE_WEIGHT = { high: 3, medium: 2, low: 1 };

function assemble(items, categories, log) {
  // Build category lookup from DB categories
  const catMap = new Map();
  for (const cat of categories) {
    catMap.set(cat.slug, cat);
  }

  // Group items by primary category (first element of categories array)
  const grouped = new Map();
  for (const item of items) {
    const primary = (item.categories && item.categories.length > 0)
      ? item.categories[0]
      : 'top-stories';
    if (!grouped.has(primary)) grouped.set(primary, []);
    grouped.get(primary).push(item);
  }

  // Build sections ordered by category sort_order
  const sections = [];
  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  for (const cat of sortedCategories) {
    const sectionItems = grouped.get(cat.slug);
    if (!sectionItems || sectionItems.length === 0) continue;

    // Sort by significance desc, then relevance_score desc
    sectionItems.sort((a, b) => {
      const sigDiff = (SIGNIFICANCE_WEIGHT[b.significance] || 2) - (SIGNIFICANCE_WEIGHT[a.significance] || 2);
      if (sigDiff !== 0) return sigDiff;
      return (b.relevance_score || 0) - (a.relevance_score || 0);
    });

    sections.push({
      id: cat.slug,
      title: cat.name,
      icon: cat.icon || 'globe',
      items: sectionItems.map(item => ({
        title: item.curated_title || item.title,
        summary: item.summary || '',
        detail: item.detail || '',
        significance: item.significance || 'medium',
        image: item.image || null,
        sources: item.sources || [],
        reading_time: Math.max(1, Math.ceil((item.detail || '').split(/\s+/).length / 200)),
      })),
    });
  }

  // Also handle items in categories not in DB (shouldn't happen, but be safe)
  for (const [slug, sectionItems] of grouped) {
    if (catMap.has(slug)) continue;
    sectionItems.sort((a, b) => {
      const sigDiff = (SIGNIFICANCE_WEIGHT[b.significance] || 2) - (SIGNIFICANCE_WEIGHT[a.significance] || 2);
      if (sigDiff !== 0) return sigDiff;
      return (b.relevance_score || 0) - (a.relevance_score || 0);
    });
    sections.push({
      id: slug,
      title: slug,
      icon: 'globe',
      items: sectionItems.map(item => ({
        title: item.curated_title || item.title,
        summary: item.summary || '',
        detail: item.detail || '',
        significance: item.significance || 'medium',
        image: item.image || null,
        sources: item.sources || [],
        reading_time: Math.max(1, Math.ceil((item.detail || '').split(/\s+/).length / 200)),
      })),
    });
  }

  // Generate headline: curated_title of highest-significance, highest-scored item overall
  let headline = 'Daily Briefing';
  if (items.length > 0) {
    const sorted = [...items].sort((a, b) => {
      const sigDiff = (SIGNIFICANCE_WEIGHT[b.significance] || 2) - (SIGNIFICANCE_WEIGHT[a.significance] || 2);
      if (sigDiff !== 0) return sigDiff;
      return (b.relevance_score || 0) - (a.relevance_score || 0);
    });
    headline = sorted[0].curated_title || sorted[0].title || headline;
  }

  // Log section breakdown
  const breakdown = sections.map(s => `${s.title}: ${s.items.length} items`).join(', ');
  log.info('assembler', `Assembled briefing: ${sections.length} sections, ${items.length} items total (${breakdown})`);

  return {
    headline,
    sections,
  };
}

module.exports = { assemble };
