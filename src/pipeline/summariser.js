'use strict';

const ARTICLE_CHAR_LIMIT = 4000;
const COMMENT_CHAR_LIMIT = 300;
const MAX_COMMENTS = 5;

function truncate(str, n) {
  if (typeof str !== 'string') return '';
  return str.length > n ? str.slice(0, n).trimEnd() + '...' : str;
}

function buildPrompt(item, preferences) {
  const sourcesStr = item.sources
    ? item.sources.map(s => s.name).join(', ')
    : item.source_name || 'Unknown';

  const content = item.merged_descriptions && item.merged_descriptions.length > 0
    ? item.merged_descriptions.join('\n\n---\n\n')
    : item.description || '';

  const hasArticle = typeof item.article_content === 'string' && item.article_content.trim().length > 0;
  const hasComments = Array.isArray(item.top_comments) && item.top_comments.length > 0;

  let contentBlock;
  if (hasArticle || hasComments) {
    const sections = [];

    if (hasArticle) {
      sections.push(`ARTICLE CONTENT:\n${truncate(item.article_content, ARTICLE_CHAR_LIMIT)}`);
    }

    if (hasComments) {
      const comments = item.top_comments
        .filter(c => typeof c === 'string' && c.trim().length > 0)
        .slice(0, MAX_COMMENTS)
        .map((c, i) => `[${i + 1}] ${truncate(c, COMMENT_CHAR_LIMIT)}`)
        .join('\n');
      if (comments) {
        sections.push(`COMMUNITY COMMENTS:\n${comments}`);
      }
    }

    sections.push(`DESCRIPTION:\n${content}`);
    contentBlock = sections.join('\n\n');
  } else {
    contentBlock = content;
  }

  return `You are a news editor. Rewrite and summarise this article for a daily briefing.

Style: ${preferences.tone}. Language: ${preferences.language}.

Original headline: ${item.title}
Sources: ${sourcesStr}
Content:
${contentBlock}

Respond in this exact JSON format (no markdown, no code blocks):
{"title":"Clear, informative rewritten headline","summary":"One sentence key takeaway","detail":"2-5 sentence synthesis. For multi-source stories, note key differences.","significance":"high|medium|low"}`;
}

function parseJSON(text) {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch (_) {
    // ignore
  }

  // Try extracting from markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (_) {
      // ignore
    }
  }

  // Try finding JSON object in text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (_) {
      // ignore
    }
  }

  return null;
}

async function summarise(items, ollama, settings, log, emitProgress, checkCancelled) {
  const preferences = settings.getPreferences();
  const results = [];
  let totalTokens = 0;
  let totalDuration = 0;
  let enrichedWithArticle = 0;
  let enrichedWithComments = 0;
  if (emitProgress) emitProgress('summarise', 0, items.length);
  let sumIdx = 0;

  for (const item of items) {
    if (checkCancelled) checkCancelled();
    const prompt = buildPrompt(item, preferences);

    if (typeof item.article_content === 'string' && item.article_content.trim().length > 0) {
      enrichedWithArticle++;
    }
    if (Array.isArray(item.top_comments) && item.top_comments.some(c => typeof c === 'string' && c.trim().length > 0)) {
      enrichedWithComments++;
    }

    try {
      const result = await ollama.generate(
        settings.getOllamaUrl(), settings.getOllamaModel(), prompt, { temperature: 0.3 }
      );

      totalTokens += result.tokens;
      totalDuration += result.duration_ms;

      const parsed = parseJSON(result.response);

      if (parsed && parsed.title && parsed.summary) {
        const significance = ['high', 'medium', 'low'].includes(parsed.significance)
          ? parsed.significance
          : 'medium';

        results.push({
          ...item,
          curated_title: parsed.title,
          summary: parsed.summary,
          detail: parsed.detail || parsed.summary,
          significance,
        });

        log.info('pipeline:summariser', `Summarised: "${parsed.title}" [${significance}] (${result.duration_ms}ms)`);
      } else {
        log.warn('pipeline:summariser', `JSON parse failed for "${item.title}", using fallback`, {
          response_preview: result.response.substring(0, 200),
        });

        results.push({
          ...item,
          curated_title: item.title,
          summary: (item.description || '').substring(0, 200),
          detail: item.description || '',
          significance: 'medium',
        });
      }
    } catch (err) {
      log.warn('pipeline:summariser', `Ollama error for "${item.title}", using fallback: ${err.message}`);

      results.push({
        ...item,
        curated_title: item.title,
        summary: (item.description || '').substring(0, 200),
        detail: item.description || '',
        significance: 'medium',
      });
    }
    sumIdx++;
    if (emitProgress) emitProgress('summarise', sumIdx, items.length);
  }

  const avgDuration = items.length > 0 ? Math.round(totalDuration / items.length) : 0;

  log.info('pipeline:summariser', `Summarised ${results.length} items in ${totalDuration}ms (avg ${avgDuration}ms/item, ${totalTokens} tokens total)`);

  const stats = {
    items_summarised: results.length,
    total_tokens: totalTokens,
    total_duration_ms: totalDuration,
    avg_duration_ms: avgDuration,
    enriched_with_article: enrichedWithArticle,
    enriched_with_comments: enrichedWithComments,
  };

  return { items: results, stats };
}

module.exports = { summarise };
