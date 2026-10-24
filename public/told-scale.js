(function(root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ToldScale = api;
})(typeof window === 'object' ? window : null, function() {
  'use strict';

  var BANDS = Object.freeze({
    against: Object.freeze([6, 34]),
    plain: Object.freeze([38, 62]),
    toward: Object.freeze([66, 94])
  });
  var STANCES = ['against', 'plain', 'toward'];
  var MIN_LABEL_SEPARATION = 13;

  function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function shortenOutletLabel(value) {
    var label = cleanText(value);
    label = label.replace(/\s+\((?:Google News|API)\)$/i, '');
    label = label.replace(/\s+(?:World|AU)$/i, '');

    if (/^Ars Technica$/i.test(label)) return 'Ars';
    if (/^ABC (?:Tasmania|News Australia)$/i.test(label)) return 'ABC';
    if (/^SBS News$/i.test(label)) return 'SBS';
    return label.replace(/^The\s+/i, '') || cleanText(value);
  }

  function stanceLabel(stance) {
    return stance === 'toward' ? 'for' : stance;
  }

  function spread(count, band) {
    if (count <= 0) return [];
    if (count === 1) return [(band[0] + band[1]) / 2];
    var step = (band[1] - band[0]) / (count - 1);
    return Array.from({ length: count }, function(_, index) {
      return Number((band[0] + step * index).toFixed(4));
    });
  }

  function cleanStance(value) {
    if (!value || typeof value !== 'object') return null;
    var outlet = cleanText(value.outlet);
    var stance = cleanText(value.stance).toLowerCase();
    if (!outlet || STANCES.indexOf(stance) === -1) return null;
    return {
      outlet: outlet,
      stance: stance,
      quote: cleanText(value.quote)
    };
  }

  function mergedDots(stances) {
    var dots = [];
    var byQuote = new Map();
    stances.forEach(function(rawStance) {
      var stance = cleanStance(rawStance);
      if (!stance) return;
      var key = stance.stance + '\u0000' + stance.quote;
      var dot = byQuote.get(key);
      if (!dot) {
        dot = {
          outlets: [],
          stance: stance.stance,
          displayStance: stanceLabel(stance.stance),
          quote: stance.quote
        };
        byQuote.set(key, dot);
        dots.push(dot);
      }
      dot.outlets.push(stance.outlet);
    });
    return dots;
  }

  function layoutSubject(subject) {
    var input = subject && typeof subject === 'object' ? subject : {};
    var dots = mergedDots(Array.isArray(input.stances) ? input.stances : []);
    var laidOut = [];

    STANCES.forEach(function(stance) {
      var inBand = dots.filter(function(dot) { return dot.stance === stance; });
      var positions = spread(inBand.length, BANDS[stance]);
      inBand.forEach(function(dot, index) {
        var sameBandPrevious = index > 0 ? laidOut[laidOut.length - 1] : null;
        var labelRow = sameBandPrevious && positions[index] - sameBandPrevious.position < MIN_LABEL_SEPARATION
          ? (sameBandPrevious.labelRow === 0 ? 1 : 0)
          : 0;
        dot.position = positions[index];
        dot.labelRow = labelRow;
        dot.label = dot.outlets.length > 1
          ? dot.outlets.length + ' outlets'
          : shortenOutletLabel(dot.outlets[0]);
        laidOut.push(dot);
      });
    });

    return {
      name: cleanText(input.name),
      kind: cleanText(input.kind),
      dots: laidOut
    };
  }

  function layoutSubjects(subjects) {
    return (Array.isArray(subjects) ? subjects : []).map(layoutSubject).filter(function(subject) {
      return subject.name && subject.dots.length;
    });
  }

  return Object.freeze({
    BANDS: BANDS,
    MIN_LABEL_SEPARATION: MIN_LABEL_SEPARATION,
    layoutSubject: layoutSubject,
    layoutSubjects: layoutSubjects,
    shortenOutletLabel: shortenOutletLabel,
    stanceLabel: stanceLabel
  });
});
