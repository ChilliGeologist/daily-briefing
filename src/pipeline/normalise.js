'use strict';

const TRACKING_PARAM = /^(utm_.*|ref|fbclid|gclid|mc_cid|mc_eid|cmp|ocid|s_cid)$/i;

function canonicalUrl(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = '';

    for (const name of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAM.test(name)) parsed.searchParams.delete(name);
    }

    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch (_) {
    return null;
  }
}

function stripPublisherSuffix(title) {
  const value = title.trim();
  const separator = value.lastIndexOf(' - ');
  if (separator === -1) return { title: value, publisher: null };

  const publisher = value.slice(separator + 3).trim();
  if (publisher.length === 0 || publisher.length > 40) {
    return { title: value, publisher: null };
  }

  return { title: value.slice(0, separator).trim(), publisher };
}

function outletOf(item) {
  if (item.publisher) return item.publisher.toLowerCase();

  if (item.canonical_url) {
    try {
      return new URL(item.canonical_url).hostname.replace(/^www\./i, '').toLowerCase();
    } catch (_) {
      // Fall through to the source name.
    }
  }

  return item.source_name;
}

function normalise(items) {
  return items.map(item => {
    let isGoogle = false;
    try {
      isGoogle = /(^|\.)news\.google\.com$/i.test(new URL(item.url).hostname);
    } catch (_) {
      // Invalid URLs are handled by canonicalUrl below.
    }

    const titleParts = isGoogle
      ? stripPublisherSuffix(item.title)
      : { title: item.title.trim(), publisher: null };
    const candidateUrl = item.source_type === 'reddit'
      ? (item.external_url || item.url)
      : item.url;
    const canonical_url = canonicalUrl(candidateUrl);
    const normalised = {
      ...item,
      title: titleParts.title,
      publisher: titleParts.publisher,
      canonical_url,
    };

    return { ...normalised, outlet: outletOf(normalised) };
  });
}

module.exports = { canonicalUrl, stripPublisherSuffix, outletOf, normalise };
