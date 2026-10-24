(function(root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SunTimes = api;
})(typeof window === 'object' ? window : null, function() {
  'use strict';

  var LATITUDE = -41.30;
  var LONGITUDE = 146.98;
  var TIME_ZONE = 'Australia/Hobart';
  var DAY = 24 * 60 * 60 * 1000;

  function partsForDate(value) {
    if (typeof value === 'string') {
      var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!match) throw new TypeError('Expected a Date or YYYY-MM-DD');
      return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    }
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new TypeError('Expected a valid Date or YYYY-MM-DD');
    }
    var formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    var result = {};
    formatter.formatToParts(value).forEach(function(part) {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') result[part.type] = Number(part.value);
    });
    return result;
  }

  function dayOfYear(year, month, day) {
    return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / DAY);
  }

  function timeZoneOffsetMinutes(year, month, day) {
    var probe = new Date(Date.UTC(year, month - 1, day, 12));
    var formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    var local = {};
    formatter.formatToParts(probe).forEach(function(part) {
      if (part.type !== 'literal') local[part.type] = Number(part.value);
    });
    var asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    return (asUtc - probe.getTime()) / 60000;
  }

  function dateAtLocalMinutes(parts, minutes, offsetMinutes) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + (minutes - offsetMinutes) * 60000);
  }

  // NOAA's fractional-year, equation-of-time and solar-declination equations.
  // The 90.833 degree zenith includes the standard refraction correction.
  function sunTimesForDate(value) {
    var parts = partsForDate(value);
    var daysInYear = new Date(Date.UTC(parts.year, 1, 29)).getUTCDate() === 29 ? 366 : 365;
    var gamma = 2 * Math.PI / daysInYear * (dayOfYear(parts.year, parts.month, parts.day) - 1);
    var equationOfTime = 229.18 * (
      0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
    );
    var declination =
      0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
    var latitudeRadians = LATITUDE * Math.PI / 180;
    var zenith = 90.833 * Math.PI / 180;
    var hourAngle = Math.acos(
      Math.cos(zenith) / (Math.cos(latitudeRadians) * Math.cos(declination)) -
      Math.tan(latitudeRadians) * Math.tan(declination)
    ) * 180 / Math.PI;
    var offset = timeZoneOffsetMinutes(parts.year, parts.month, parts.day);
    var solarNoon = 720 - 4 * LONGITUDE - equationOfTime + offset;

    return Object.freeze({
      sunrise: dateAtLocalMinutes(parts, solarNoon - 4 * hourAngle, offset),
      sunset: dateAtLocalMinutes(parts, solarNoon + 4 * hourAngle, offset)
    });
  }

  function isDarkAt(value) {
    var now = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(now.getTime())) throw new TypeError('Expected a valid date and time');
    var times = sunTimesForDate(now);
    return now < times.sunrise || now >= times.sunset;
  }

  function nextSunBoundary(value) {
    var now = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(now.getTime())) throw new TypeError('Expected a valid date and time');
    var parts = partsForDate(now);
    var times = sunTimesForDate(now);
    if (now < times.sunrise) return times.sunrise;
    if (now < times.sunset) return times.sunset;
    var tomorrowUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + DAY);
    var tomorrow = [tomorrowUtc.getUTCFullYear(), String(tomorrowUtc.getUTCMonth() + 1).padStart(2, '0'), String(tomorrowUtc.getUTCDate()).padStart(2, '0')].join('-');
    return sunTimesForDate(tomorrow).sunrise;
  }

  return Object.freeze({
    HOME: Object.freeze({ latitude: LATITUDE, longitude: LONGITUDE, timeZone: TIME_ZONE }),
    sunTimesForDate: sunTimesForDate,
    isDarkAt: isDarkAt,
    nextSunBoundary: nextSunBoundary
  });
});
