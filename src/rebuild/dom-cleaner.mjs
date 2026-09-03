import * as cheerio from 'cheerio';

const FRAMEWORK_PAYLOAD = /self\.__next_f|__NEXT_DATA__|__NUXT__|webpackChunk|vite\/client/i;
const NEXT_IMAGE_OPTIMIZER = /(?:^|,\s*)\/_next\/image\?/i;
const TRACKING = /googletagmanager|google-analytics|facebook\.(?:net|com)|posthog|segment\.com|citeme\.io|visitors\.now|clarity\.ms|hotjar|plausible\.io/i;
const NON_FUNCTIONAL_LINK_REL = new Set(['preload', 'modulepreload', 'prefetch', 'icon', 'apple-touch-icon']);

function isHiddenPixel(node) {
  const width = Number.parseFloat(node.attr('width') || '');
  const height = Number.parseFloat(node.attr('height') || '');
  const tiny = Number.isFinite(width) && Number.isFinite(height) && width <= 1 && height <= 1;
  const style = String(node.attr('style') || '');
  const hidden = /display\s*:\s*none|visibility\s*:\s*hidden|width\s*:\s*0|height\s*:\s*0|overflow\s*:\s*hidden/i.test(style);
  return tiny && hidden;
}

export function cleanRebuildDocument({ html = '' } = {}) {
  const $ = cheerio.load(html);
  const removed = {
    scripts: 0,
    preloads: 0,
    hints: 0,
    trackers: 0,
    formsNeutralized: 0,
    srcsets: 0,
  };

  $('script').each((_i, element) => {
    const node = $(element);
    const type = String(node.attr('type') || '').toLowerCase();
    if (type === 'application/ld+json') return;

    const src = node.attr('src') || '';
    const text = node.html() || '';
    const tracking = TRACKING.test(src) || TRACKING.test(text);
    const shouldRemove = Boolean(src) || tracking || FRAMEWORK_PAYLOAD.test(text);
    if (!shouldRemove) return;

    if (tracking) removed.trackers += 1;
    removed.scripts += 1;
    node.remove();
  });

  $('[srcset]').each((_i, element) => {
    const node = $(element);
    const srcset = node.attr('srcset') || '';
    if (!NEXT_IMAGE_OPTIMIZER.test(srcset)) return;
    node.removeAttr('srcset');
    removed.srcsets += 1;
    if (String(element.tagName || '').toLowerCase() === 'source' && !node.attr('src')) node.remove();
  });

  $('link[rel]').each((_i, element) => {
    const node = $(element);
    const rels = String(node.attr('rel') || '').toLowerCase().split(/\s+/).filter(Boolean);
    const removable = rels.some((rel) => NON_FUNCTIONAL_LINK_REL.has(rel) || rel.startsWith('apple-touch-icon'));
    if (!removable) return;
    if (rels.includes('preload')) removed.preloads += 1;
    removed.hints += 1;
    node.remove();
  });

  $('noscript').each((_i, element) => {
    const node = $(element);
    const content = `${node.html() || ''} ${node.text() || ''}`;
    if (!TRACKING.test(content)) return;
    removed.trackers += 1;
    node.remove();
  });

  $('iframe[src], img[src]').each((_i, element) => {
    const node = $(element);
    const src = node.attr('src') || '';
    const tag = String(element.tagName || '').toLowerCase();
    const tracking = TRACKING.test(src) || (tag === 'img' && isHiddenPixel(node));
    if (!tracking) return;
    removed.trackers += 1;
    node.remove();
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
