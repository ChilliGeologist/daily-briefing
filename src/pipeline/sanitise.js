'use strict';

const { parseHTML } = require('linkedom');

const ALLOWED_TAGS = new Set([
  'p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'b', 'i',
  'a', 'img', 'figure', 'figcaption', 'br',
]);
const REMOVE_WITH_CONTENTS = new Set([
  'script', 'style', 'iframe', 'form', 'noscript', 'svg', 'button', 'input', 'select',
  'textarea', 'object', 'embed',
]);

function hasAllowedProtocol(value, protocols) {
  try {
    return protocols.has(new URL(value).protocol);
  } catch (_) {
    return false;
  }
}

function sanitiseElement(element) {
  const tag = element.localName.toLowerCase();

  if (REMOVE_WITH_CONTENTS.has(tag)) {
    element.remove();
    return;
  }

  for (const child of [...element.children]) sanitiseElement(child);

  if (!ALLOWED_TAGS.has(tag)) {
    element.replaceWith(...element.childNodes);
    return;
  }

  if (tag === 'a') {
    const href = element.getAttribute('href');
    if (!href || !hasAllowedProtocol(href, new Set(['http:', 'https:']))) {
      element.replaceWith(...element.childNodes);
      return;
    }
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    element.setAttribute('target', '_blank');
    element.setAttribute('rel', 'noopener noreferrer');
    element.setAttribute('href', href);
    return;
  }

  if (tag === 'img') {
    const src = element.getAttribute('src');
    const alt = element.getAttribute('alt');
    if (!src || !hasAllowedProtocol(src, new Set(['https:']))) {
      element.remove();
      return;
    }
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (alt != null) element.setAttribute('alt', alt);
    element.setAttribute('src', src);
    return;
  }

  for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
}

function sanitiseHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  for (const child of [...document.body.children]) sanitiseElement(child);
  return document.body.innerHTML;
}

module.exports = { sanitiseHtml };
