import * as cheerio from 'cheerio';

const FRAMEWORK_PAYLOAD = /self\.__next_f|__NEXT_DATA__|__NUXT__|webpackChunk|vite\/client/i;

export function cleanRebuildDocument({ html = '' } = {}) {
  const $ = cheerio.load(html);
  const removed = { scripts: 0, preloads: 0, trackers: 0, formsNeutralized: 0 };

  $('script').each((_i, element) => {
    const node = $(element);
    const type = String(node.attr('type') || '').toLowerCase();
    if (type === 'application/ld+json') return;

    const src = node.attr('src') || '';
    const text = node.html() || '';
    const tracking = /googletagmanager|google-analytics|facebook\.net|posthog|segment\.com/i.test(src);
    const shouldRemove = Boolean(src) || tracking || FRAMEWORK_PAYLOAD.test(text);
    if (!shouldRemove) return;

    if (tracking) removed.trackers += 1;
    removed.scripts += 1;
    node.remove();
  });

  const seenPreloads = new Set();
  $('link[rel="preload"][href]').each((_i, element) => {
    const node = $(element);
    const href = node.attr('href') || '';
    const key = `${href}|${node.attr('as') || ''}`;
    if (seenPreloads.has(key)) {
      removed.preloads += 1;
      node.remove();
      return;
    }
    seenPreloads.add(key);
  });

  $('form[action]').each((_i, element) => {
    const node = $(element);
    const action = node.attr('action') || '';
    if (!action || action === '#') return;
    node.attr('data-aspirator-original-action', action);
    node.attr('action', '#');
    removed.formsNeutralized += 1;
  });

  return { html: $.html(), removed };
}
