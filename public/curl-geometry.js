(function(root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CurlGeometry = api;
})(typeof window === 'object' ? window : null, function() {
  'use strict';

  function nearestCorner(pointerY, height) {
    var pageHeight = Math.max(0, Number(height) || 0);
    return Number(pointerY) > pageHeight / 2
      ? { cornerY: pageHeight, sign: 1 }
      : { cornerY: 0, sign: -1 };
  }

  function clipHalf(width, height, midpoint, normal, keepPositive) {
    var points = [[0, 0], [width, 0], [width, height], [0, height]];
    var output = [];
    var direction = keepPositive ? 1 : -1;

    function distance(point) {
      return ((point[0] - midpoint[0]) * normal[0] + (point[1] - midpoint[1]) * normal[1]) * direction;
    }

    for (var index = 0; index < points.length; index++) {
      var start = points[index];
      var end = points[(index + 1) % points.length];
      var startDistance = distance(start);
      var endDistance = distance(end);
      if (startDistance >= 0) output.push(start.slice());
      if ((startDistance >= 0) !== (endDistance >= 0)) {
        var amount = startDistance / (startDistance - endDistance);
        output.push([
          start[0] + (end[0] - start[0]) * amount,
          start[1] + (end[1] - start[1]) * amount
        ]);
      }
    }
    return output;
  }

  function curlFrame(options) {
    var width = Math.max(0, Number(options && options.width) || 0);
    var height = Math.max(0, Number(options && options.height) || 0);
    var progress = Number(options && options.progress);
    var cornerY = Number(options && options.cornerY) || 0;
    var sign = Number(options && options.sign) < 0 ? -1 : 1;
    var dragY = Number(options && options.dragY) || 0;
    if (!Number.isFinite(progress)) progress = 0;
    progress = Math.max(0, Math.min(1, progress));

    var lift = 90 * Math.sin(Math.PI * progress);
    var grabCorner = [width, cornerY];
    var finger = [width - 2 * width * progress, cornerY + dragY - sign * lift];
    var midpoint = [(grabCorner[0] + finger[0]) / 2, (grabCorner[1] + finger[1]) / 2];
    var delta = [grabCorner[0] - finger[0], grabCorner[1] - finger[1]];
    var length = Math.hypot(delta[0], delta[1]);
    var normal = length ? [delta[0] / length, delta[1] / length] : [1, 0];
    var creaseDirection = [-normal[1], normal[0]];
    var creaseAngle = Math.atan2(normal[1], normal[0]) * 180 / Math.PI;
    var matrix00 = 2 * creaseDirection[0] * creaseDirection[0] - 1;
    var matrix01 = 2 * creaseDirection[0] * creaseDirection[1];
    var matrix11 = 2 * creaseDirection[1] * creaseDirection[1] - 1;
    var translation = [
      midpoint[0] - (matrix00 * midpoint[0] + matrix01 * midpoint[1]),
      midpoint[1] - (matrix01 * midpoint[0] + matrix11 * midpoint[1])
    ];
    var foldWidth = Math.max(20, length / 2);

    return {
      progress: progress,
      lift: lift,
      grabCorner: grabCorner,
      finger: finger,
      midpoint: midpoint,
      normal: normal,
      creaseDirection: creaseDirection,
      creaseAngle: creaseAngle,
      frontPolygon: clipHalf(width, height, midpoint, normal, false),
      flapPolygon: clipHalf(width, height, midpoint, normal, true),
      reflection: {
        matrix: [matrix00, matrix01, matrix01, matrix11],
        translation: translation
      },
      foldWidth: foldWidth,
      lighting: {
        curl: {
          strengths: [0.28, 0.55, 0.12, 0.10, 0.18],
          widths: [0, foldWidth * 0.18, foldWidth * 0.45, foldWidth, foldWidth * 1.6]
        },
        crease: {
          strength: 0.22 * Math.min(1, 4 * progress),
          width: Math.min(36, 0.5 * foldWidth)
        },
        cast: {
          strength: 0.45 * (1 - progress),
          width: 30 + 50 * (1 - progress)
        }
      }
    };
  }

  return Object.freeze({
    nearestCorner: nearestCorner,
    clipHalf: clipHalf,
    curlFrame: curlFrame
  });
});
