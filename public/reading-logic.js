(function(root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ReadingLogic = api;
})(typeof window === 'object' ? window : null, function() {
  'use strict';

  function isTopSection(section) {
    return Boolean(section) && (section.id === 'top' || (!section.id && String(section.title || '').toLowerCase() === 'you should know'));
  }

  function prepareSections(sections) {
    var input = Array.isArray(sections) ? sections : [];
    var ordered = input.filter(isTopSection)
      .concat(input.filter(function(section) { return section && !isTopSection(section); }));
    var seenIds = new Set();

    return ordered.map(function(section) {
      function unique(items) {
        return (Array.isArray(items) ? items : []).filter(function(item) {
          if (!item || item.id === undefined || item.id === null || item.id === '') return true;
          var key = String(item.id);
          if (seenIds.has(key)) return false;
          seenIds.add(key);
          return true;
        });
      }

      var items = unique(section.items);
      var more = unique(section.more);

      return {
        section: section,
        shown: items.concat(more),
        hidden: []
      };
    });
  }

  // Old briefing blobs were produced by several writer generations. Most
  // carry a real array here, but some deployed copies contain JSON or a
  // Python repr. This deliberately implements only data literals; it never
  // evaluates stored text.
  function parsePythonLiteral(input) {
    var text = String(input || '');
    var index = 0;

    function whitespace() {
      while (/\s/.test(text.charAt(index))) index += 1;
    }

    function string() {
      var quote = text.charAt(index++);
      var result = '';
      while (index < text.length) {
        var character = text.charAt(index++);
        if (character === quote) return result;
        if (character === '\\' && index < text.length) {
          var escaped = text.charAt(index++);
          var escapes = { n: '\n', r: '\r', t: '\t' };
          result += Object.prototype.hasOwnProperty.call(escapes, escaped) ? escapes[escaped] : escaped;
        } else {
          result += character;
        }
      }
      throw new Error('unterminated string');
    }

    function value() {
      whitespace();
      var character = text.charAt(index);
      if (character === "'" || character === '"') return string();
      if (character === '[') {
        index += 1;
        var list = [];
        whitespace();
        while (text.charAt(index) !== ']') {
          list.push(value());
          whitespace();
          if (text.charAt(index) === ',') { index += 1; whitespace(); }
          else if (text.charAt(index) !== ']') throw new Error('expected comma');
        }
        index += 1;
        return list;
      }
      if (character === '{') {
        index += 1;
        var object = {};
        whitespace();
        while (text.charAt(index) !== '}') {
          var key = value();
          whitespace();
          if (text.charAt(index++) !== ':') throw new Error('expected colon');
          object[String(key)] = value();
          whitespace();
          if (text.charAt(index) === ',') { index += 1; whitespace(); }
          else if (text.charAt(index) !== '}') throw new Error('expected comma');
        }
        index += 1;
        return object;
      }
      var start = index;
      while (index < text.length && !/[\s,\]}]/.test(text.charAt(index))) index += 1;
      var token = text.slice(start, index);
      if (token === 'None') return null;
      if (token === 'True') return true;
      if (token === 'False') return false;
      if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(token)) return Number(token);
      throw new Error('unsupported literal');
    }

    var result = value();
    whitespace();
    if (index !== text.length) throw new Error('trailing input');
    return result;
  }

  function normaliseSources(value) {
    var sources = Array.isArray(value) ? value : (value && typeof value === 'object' ? [value] : []);
    return sources.filter(function(source) {
      return typeof source === 'string' || (source && typeof source === 'object');
    });
  }

  function parseSources(value) {
    if (Array.isArray(value) || (value && typeof value === 'object')) return normaliseSources(value);
    if (typeof value !== 'string' || !value.trim()) return [];
    var text = value.trim();
    try { return normaliseSources(JSON.parse(text)); } catch (_) { /* try the legacy representation */ }
    try { return normaliseSources(parsePythonLiteral(text)); } catch (_) { /* use a plain outlet name below */ }
    return /^[\[{]/.test(text) ? [] : [text];
  }

  function storyEntries(sections) {
    var fallbackId = 0;
    var result = [];
    prepareSections(sections).forEach(function(group) {
      group.shown.forEach(function(item) {
        if (!item || typeof item !== 'object') return;
        var hasStableId = item.id !== undefined && item.id !== null && item.id !== '';
        result.push({
          item: item,
          section: group.section,
          key: hasStableId ? String(item.id) : 'legacy-story-' + (++fallbackId)
        });
      });
    });
    return result;
  }

  function prepareReaderContent(item, hasArticle) {
    var story = item || {};
    var replies = (Array.isArray(story.top_comments) ? story.top_comments : [])
      .filter(function(reply) { return typeof reply === 'string' && reply.trim(); })
      .map(function(reply) { return reply.trim(); });
    var result = {
      fallback: hasArticle ? '' : String(story.summary || '').trim(),
      post: typeof story.description === 'string' ? story.description.trim() : '',
      replies: replies
    };
    if (!hasArticle && typeof story.detail === 'string' && story.detail.trim()) {
      result.detail = story.detail.trim();
    }
    return result;
  }

  function decideGesture(options) {
    var dx = Number(options && options.dx) || 0;
    var dy = Number(options && options.dy) || 0;
    var threshold = options && options.threshold === undefined ? 8 : Number(options && options.threshold);
    if (!Number.isFinite(threshold) || threshold < 0) threshold = 8;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return 'wait';
    if (Math.abs(dy) > Math.abs(dx)) return 'vertical';
    if (options && options.side === 'briefing') {
      return dx < 0 && options.startedOnStory ? 'forward' : 'ignore';
    }
    if (options && options.side === 'reader') return dx > 0 ? 'back' : 'ignore';
    return 'ignore';
  }

  function settleGesture(options) {
    var progress = Number(options && options.progress);
    var velocityX = Number(options && options.velocityX);
    if (!Number.isFinite(progress)) progress = 0;
    if (!Number.isFinite(velocityX)) velocityX = 0;
    progress = Math.max(0, Math.min(1, progress));

    if (options && options.direction === 'forward') {
      return progress > 0.33 || velocityX < -0.5 ? 1 : 0;
    }
    return progress < 0.67 || velocityX > 0.5 ? 0 : 1;
  }

  return Object.freeze({
    prepareSections: prepareSections,
    parseSources: parseSources,
    storyEntries: storyEntries,
    prepareReaderContent: prepareReaderContent,
    decideGesture: decideGesture,
    settleGesture: settleGesture
  });
});
