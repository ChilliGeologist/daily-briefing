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

  function prepareReaderContent(item, hasArticle) {
    var story = item || {};
    var replies = (Array.isArray(story.top_comments) ? story.top_comments : [])
      .filter(function(reply) { return typeof reply === 'string' && reply.trim(); })
      .map(function(reply) { return reply.trim(); });
    return {
      fallback: hasArticle ? '' : String(story.detail || story.summary || '').trim(),
      post: typeof story.description === 'string' ? story.description.trim() : '',
      replies: replies
    };
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
    prepareReaderContent: prepareReaderContent,
    decideGesture: decideGesture,
    settleGesture: settleGesture
  });
});
