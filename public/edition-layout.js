(function(root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EditionLayout = api;
})(typeof window === 'object' ? window : null, function() {
  'use strict';

  var STANCE_GROUPS = [
    { key: 'against', label: 'Leans against' },
    { key: 'plain', label: 'Plain' },
    { key: 'toward', label: 'Leans toward' }
  ];

  function finiteWidth(value) {
    var width = Number(value);
    return Number.isFinite(width) && width > 0 ? width : 0;
  }

  function layoutForWidth(value) {
    var width = finiteWidth(value);
    var columns = width >= 1900 ? 5 : width >= 1360 ? 4 : width >= 1024 ? 3 : width >= 700 ? 2 : 1;
    // From 1024 px the paper runs to the window edge; its margin is padding inside it.
    var sideMargin = width >= 1024
      ? 0
      : width >= 700
        ? Math.max(0, (width - 820) / 2)
        : 0;
    return {
      viewportWidth: width,
      paperWidth: Math.max(0, width - sideMargin * 2),
      sideMargin: sideMargin,
      columns: columns,
      pairedColumns: Math.max(1, Math.ceil(columns / 2)),
      topRemainderColumns: Math.max(1, columns - 2)
    };
  }

  function topSection(group) {
    var section = group && group.section;
    if (!section) return false;
    return section.id === 'top' || (!section.id && String(section.title || '').toLowerCase() === 'you should know');
  }

  function storyCount(group) {
    var shown = Array.isArray(group && group.shown) ? group.shown.length : 0;
    var briefs = Array.isArray(group && group.briefs) ? group.briefs.length : 0;
    return shown + briefs;
  }

  function shortOrdinarySection(group) {
    return !topSection(group) && storyCount(group) <= 6;
  }

  function planSectionBands(groups) {
    var sections = Array.isArray(groups) ? groups : [];
    var bands = [];
    for (var index = 0; index < sections.length; index++) {
      var current = sections[index];
      var next = sections[index + 1];
      if (shortOrdinarySection(current) && next && shortOrdinarySection(next)) {
        bands.push({ shared: true, sections: [current, next] });
        index++;
      } else {
        bands.push({ shared: false, sections: [current] });
      }
    }
    return bands;
  }

  function storyImageUrl(story) {
    if (story && typeof story.image === 'string' && story.image.trim()) return story.image.trim();
    var images = Array.isArray(story && story.images) ? story.images : [];
    for (var index = 0; index < images.length; index++) {
      if (typeof images[index] === 'string' && images[index].trim()) return images[index].trim();
    }
    return '';
  }

  function frontPagePictureIndex(stories, isTop) {
    var list = Array.isArray(stories) ? stories : [];
    if (isTop) return list.length && storyImageUrl(list[0]) ? 0 : -1;
    for (var index = 0; index < list.length; index++) {
      if (storyImageUrl(list[index])) return index;
    }
    return -1;
  }

  function readerImageUrls(story) {
    var candidates = (Array.isArray(story && story.images) ? story.images : []).slice();
    if (story && story.image) candidates.push(story.image);
    var seen = new Set();
    return candidates.filter(function(url) {
      if (typeof url !== 'string' || !url.trim()) return false;
      var clean = url.trim();
      if (seen.has(clean)) return false;
      seen.add(clean);
      return true;
    }).map(function(url) { return url.trim(); });
  }

  function cleanOutlet(outlet) {
    if (!outlet || typeof outlet !== 'object') return null;
    var name = typeof outlet.name === 'string' ? outlet.name.trim() : '';
    var headline = typeof outlet.headline === 'string' ? outlet.headline.trim() : '';
    if (!name && !headline) return null;
    return {
      name: name || 'Unknown outlet',
      headline: headline,
      url: typeof outlet.url === 'string' ? outlet.url.trim() : ''
    };
  }

  function cleanStance(stance) {
    if (!stance || typeof stance !== 'object') return null;
    var key = typeof stance.stance === 'string' ? stance.stance.trim().toLowerCase() : '';
    if (!STANCE_GROUPS.some(function(group) { return group.key === key; })) return null;
    var outlet = typeof stance.outlet === 'string' ? stance.outlet.trim() : '';
    if (!outlet) return null;
    return {
      outlet: outlet,
      stance: key,
      quote: typeof stance.quote === 'string' ? stance.quote.trim() : ''
    };
  }

  function prepareToldPanel(told) {
    var input = told && typeof told === 'object' ? told : {};
    var headlines = (Array.isArray(input.outlets) ? input.outlets : []).map(cleanOutlet).filter(Boolean);
    var subjects = (Array.isArray(input.subjects) ? input.subjects : []).map(function(subject) {
      if (!subject || typeof subject !== 'object') return null;
      var name = typeof subject.name === 'string' ? subject.name.trim() : '';
      if (!name) return null;
      var stances = (Array.isArray(subject.stances) ? subject.stances : []).map(cleanStance).filter(Boolean);
      var groups = STANCE_GROUPS.map(function(definition) {
        return {
          key: definition.key,
          label: definition.label,
          stances: stances.filter(function(stance) { return stance.stance === definition.key; })
        };
      }).filter(function(group) { return group.stances.length > 0; });
      if (!groups.length) return null;
      return {
        name: name,
        kind: typeof subject.kind === 'string' ? subject.kind.trim() : '',
        groups: groups
      };
    }).filter(Boolean);

    return {
      outletCount: headlines.length,
      differs: Boolean(input.differs),
      sameWay: subjects.length === 0,
      subjects: subjects,
      headlines: headlines
    };
  }

  function balanceColumnHeights(values, requestedColumns) {
    var source = Array.isArray(values) ? values : [];
    var heights = source.map(function(value) {
      var height = Number(value);
      return Number.isFinite(height) && height > 0 ? height : 0;
    });
    var columns = Math.max(1, Math.floor(Number(requestedColumns) || 1));
    if (!heights.length) {
      return { heights: Array(columns).fill(0), blank: Array(columns).fill(0), tallest: 0 };
    }

    var usedColumns = Math.min(columns, heights.length);
    var length = heights.length;
    var prefix = [0];
    heights.forEach(function(height) { prefix.push(prefix[prefix.length - 1] + height); });
    var costs = Array.from({ length: usedColumns + 1 }, function() { return Array(length + 1).fill(Infinity); });
    var cuts = Array.from({ length: usedColumns + 1 }, function() { return Array(length + 1).fill(0); });
    costs[0][0] = 0;

    for (var column = 1; column <= usedColumns; column++) {
      for (var end = column; end <= length; end++) {
        for (var cut = column - 1; cut < end; cut++) {
          var cost = Math.max(costs[column - 1][cut], prefix[end] - prefix[cut]);
          if (cost < costs[column][end]) {
            costs[column][end] = cost;
            cuts[column][end] = cut;
          }
        }
      }
    }

    var result = [];
    var cursor = length;
    for (var part = usedColumns; part > 0; part--) {
      var start = cuts[part][cursor];
      result.unshift(prefix[cursor] - prefix[start]);
      cursor = start;
    }
    while (result.length < columns) result.push(0);
    var tallest = Math.max.apply(Math, result);
    return {
      heights: result,
      blank: result.map(function(height) { return tallest - height; }),
      tallest: tallest
    };
  }

  // Columns beside the front-page lead. Stories pair up down each column, so four
  // stories take two columns, never three with one left empty; the lead takes the rest.
  function topSplit(columns, restCount) {
    var total = Math.max(1, Math.floor(Number(columns) || 1));
    if (total < 3) return { leadSpan: total, restColumns: 1 };
    var rest = Math.max(1, Math.min(total - 2, Math.ceil((Number(restCount) || 0) / 2)));
    return { leadSpan: total - rest, restColumns: rest };
  }

  return Object.freeze({
    balanceColumnHeights: balanceColumnHeights,
    frontPagePictureIndex: frontPagePictureIndex,
    layoutForWidth: layoutForWidth,
    planSectionBands: planSectionBands,
    prepareToldPanel: prepareToldPanel,
    readerImageUrls: readerImageUrls,
    storyImageUrl: storyImageUrl,
    topSplit: topSplit
  });
});
