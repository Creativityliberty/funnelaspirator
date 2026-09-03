import * as cheerio from 'cheerio';
import { elementFingerprint } from '../compiler/html-components.mjs';

function locateByFingerprint($, fingerprint) {
  if (!fingerprint) return null;
  let match = null;
  $('body *').each((_i, element) => {
    if (match) return;
    if (elementFingerprint($, element) === fingerprint) match = element;
  });
  return match;
}

function locate($, locator = {}) {
  if (!locator) return null;
  try {
    if (locator.strategy === 'id' && locator.selector) {
      return $(locator.selector).first().get(0) || null;
    }
    if (locator.strategy === 'selector-ordinal' && locator.selector) {
      return $(locator.selector).eq(locator.ordinal || 0).get(0) || null;
    }
  } catch {
    return null;
  }
  return locateByFingerprint($, locator.fingerprint);
}

function verifyFingerprint($, element, locator) {
  if (!element) return false;
  if (!locator?.fingerprint) return true;
  return elementFingerprint($, element) === locator.fingerprint;
}

export function sliceComponents({ html = '', occurrences = [] } = {}) {
  const $ = cheerio.load(html);
  const components = [];
  const unresolved = [];
  const resolvedNodes = [];

  for (const occurrence of occurrences || []) {
    const element = locate($, occurrence.locator);
    const occurrenceIndex = Number.isInteger(occurrence.index) ? occurrence.index : null;
    if (!element || !verifyFingerprint($, element, occurrence.locator)) {
      unresolved.push({
        componentId: occurrence.componentId || null,
        occurrenceIndex,
        role: occurrence.role || null,
        locator: occurrence.locator || null,
        reason: element ? 'fingerprint-mismatch' : 'not-found',
      });
      continue;
    }

    const markup = $.html(element);
    components.push({
      componentId: occurrence.componentId || null,
      occurrenceIndex,
      role: occurrence.role || null,
      variantId: occurrence.variantId || null,
      locator: occurrence.locator || null,
      markup,
    });
    resolvedNodes.push({ occurrence, occurrenceIndex, element });
  }

  for (const { occurrence, occurrenceIndex, element } of resolvedNodes) {
    const marker = $('<div></div>')
      .attr('data-aspirator-component', occurrence.componentId || '')
      .attr('data-aspirator-role', occurrence.role || '');
    if (occurrenceIndex != null) marker.attr('data-aspirator-occurrence', String(occurrenceIndex));
    $(element).replaceWith(marker);
  }

  return {
    components,
    residualHtml: $.html(),
    unresolved,
  };
}
