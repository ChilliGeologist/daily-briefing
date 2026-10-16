(function(root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ThumbIndexLogic = api;
})(typeof window === 'object' ? window : null, function() {
  'use strict';

  var AMPLITUDE = 46;
  var SIGMA = 44;
  var GROWTH = 1.15;
  var PICKING_REACH = 0.35;
  var ICON_INSET = 9;
  var ICON_SIZE = 18;
  var PILL_GAP = 10;
  var SECTION_IDS = ['top', 'tasmania', 'australia', 'world', 'tech', 'homelab', 'gaming', 'sport', 'internet'];

  function labelLayout(height, count) {
    var safeHeight = Number(height);
    var safeCount = Math.max(0, Math.floor(Number(count) || 0));
    if (!Number.isFinite(safeHeight) || safeHeight < 0 || safeCount === 0) return [];
    var top = safeHeight * 0.30;
    if (safeCount === 1) return [top];
    var bottom = safeHeight * 0.92;
    var step = (bottom - top) / (safeCount - 1);
    return Array.from({ length: safeCount }, function(_, index) { return top + index * step; });
  }

  function nearestSection(y, positions) {
    if (!Array.isArray(positions) || positions.length === 0) return -1;
    var pointerY = Number(y);
    if (!Number.isFinite(pointerY)) pointerY = 0;
    var best = 0;
    var bestDistance = Infinity;
    positions.forEach(function(position, index) {
      var distance = Math.abs(Number(position) - pointerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  function bowScaleTargets(options) {
    if (options && options.reducedMotion) return { x: 0, scale: 1 };
    var labelY = Number(options && options.labelY);
    var fingerY = Number(options && options.fingerY);
    if (!Number.isFinite(labelY) || !Number.isFinite(fingerY)) return { x: 0, scale: 1 };
    var distance = (labelY - fingerY) / SIGMA;
    var gaussian = Math.exp(-distance * distance);
    var reach = options && options.picking ? PICKING_REACH : 1;
    return {
      x: -AMPLITUDE * gaussian * reach,
      scale: 1 + GROWTH * gaussian
    };
  }

  function pillOffset(options) {
    var iconX = Number(options && options.iconX);
    var iconScale = Number(options && options.iconScale);
    if (!Number.isFinite(iconX)) iconX = 0;
    if (!Number.isFinite(iconScale)) iconScale = 1;
    return iconX - (ICON_INSET + ICON_SIZE * iconScale + PILL_GAP);
  }

  function sectionIconId(sectionId) {
    return SECTION_IDS.indexOf(sectionId) >= 0 ? sectionId : 'top';
  }

  return Object.freeze({
    bowScaleTargets: bowScaleTargets,
    labelLayout: labelLayout,
    nearestSection: nearestSection,
    pillOffset: pillOffset,
    sectionIconId: sectionIconId
  });
});
