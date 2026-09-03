import crypto from 'crypto';
import * as cheerio from 'cheerio';

function slugRole(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizedClasses(value = '') {
  return String(value).split(/\s+/).filter(Boolean).sort();
}

function safeToken(value) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value);
}

function escapeAttributeValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function selectorFor(tag, className) {
  const classes = normalizedClasses(className);
  if (!classes.length) return tag || '*';
  return classes.reduce((selector, classToken) => {
    if (safeToken(classToken)) return `${selector}.${classToken}`;
    return `${selector}[class~="${escapeAttributeValue(classToken)}"]`;
  }, tag || '*');
}

function idSelector(id) {
  if (safeToken(id)) return `#${id}`;
  return `[id="${escapeAttributeValue(id)}"]`;
}

function elementFingerprint($, element) {
  const node = $(element);
  const parent = node.parent();
  const payload = {
    tag: String(element?.tagName || element?.name || '').toLowerCase(),
    id: node.attr('id') || '',
    classes: normalizedClasses(node.attr('class') || ''),
    parentTag: parent.get(0)?.tagName || parent.get(0)?.name || '',
    parentClasses: normalizedClasses(parent.attr('class') || ''),
    siblingIndex: node.index(),
  };
  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 12);
}

export function buildElementLocator($, element) {
  const node = $(element);
  const id = node.attr('id') || '';
  const fingerprint = elementFingerprint($, element);

  if (id) {
    const matches = $('[id]').filter((_i, candidate) => $(candidate).attr('id') === id);
    if (matches.length === 1) {
      return { strategy: 'id', selector: idSelector(id), ordinal: 0, fingerprint };
    }
  }

  const tag = String(element?.tagName || element?.name || '').toLowerCase();
  const selector = selectorFor(tag, node.attr('class') || '');
  let matches = [];
  try {
    matches = $(selector).toArray();
  } catch {
    return { strategy: 'structural', selector: null, ordinal: 0, fingerprint };
  }
  const ordinal = matches.indexOf(element);
  if (ordinal >= 0) {
    return { strategy: 'selector-ordinal', selector, ordinal, fingerprint };
  }
  return { strategy: 'structural', selector: null, ordinal: 0, fingerprint };
}

export function inferComponentRole({ tag = '', className = '', id = '' } = {}) {
  const normalizedTag = String(tag).toLowerCase();
  const haystack = `${normalizedTag} ${className} ${id}`.toLowerCase().replace(/_/g, '-');

  if (normalizedTag === 'header' && !haystack.includes('hero')) return 'header';
  if (normalizedTag === 'footer') return 'footer';
  if (normalizedTag === 'nav' || haystack.includes('toc')) return 'navigation';
  if (haystack.includes('project-hero') || (haystack.includes('project') && haystack.includes('hero'))) return 'project-hero';
  if (haystack.includes('hero')) return 'hero';
  if (haystack.includes('gallery')) return 'gallery';
  if (haystack.includes('feedback') || haystack.includes('testimonial')) return 'testimonial';
  if (haystack.includes('faq')) return 'faq';
  if (haystack.includes('pricing') || haystack.includes('price')) return 'pricing';
  if (normalizedTag === 'form' || /\bform\b/.test(haystack)) return 'form';
  if (haystack.includes('projects-grid') || haystack.includes('projects-list') || haystack.includes('collection')) return 'collection';
  if (haystack.includes('project-next') || haystack.includes('next-project')) return 'next-project';
  if (haystack.includes('overview')) return 'overview';
  if (haystack.includes('challenge')) return 'challenge';
  if (haystack.includes('chapter')) return 'chapter';
  if (haystack.includes('credits')) return 'credits';
  if (normalizedTag === 'aside' || haystack.includes('aside')) return 'aside';
  if (haystack.includes('service-intro')) return 'intro';
  if (haystack.includes('service-expertise')) return 'expertise';
  if (haystack.includes('service-bento') || /\bbento\b/.test(haystack)) return 'bento';
  if (haystack.includes('service-benefits') || haystack.includes('benefits')) return 'benefits';
  if (haystack.includes('service-work')) return 'case-studies';
  if (haystack.includes('industry-video') || /\bvideo\b/.test(haystack)) return 'media';
  if (haystack.includes('founders')) return 'social-proof';
  if (haystack.includes('team')) return 'team';
  if (haystack.includes('speech')) return 'story';
  if (haystack.includes('manifesto')) return 'manifesto';
  if (haystack.includes('seemore')) return 'see-more';
  if (haystack.includes('services')) return 'services';
  if (haystack.includes('featured')) return 'featured-work';
  if (haystack.includes('switch')) return 'view-switch';
  if (haystack.includes('industry-')) return 'industry-section';

  const utility = new Set([
    'page', 'container', 'relative', 'row', 'section', 'wrapper', 'inner', 'content',
    'u-section', 'u-spaced', 'u-flex', 'is-revealed', 'a2-section', 'a2-dark',
  ]);

  for (const token of String(className).split(/\s+/).filter(Boolean)) {
    const candidate = slugRole(token);
    if (!candidate || utility.has(candidate)) continue;
    if (/^(u|a2|is|js|text|c)-/.test(candidate)) continue;
    return candidate;
  }

  return normalizedTag || 'section';
}

function componentFromElement($, element) {
  const node = $(element);
  const tag = String(element?.tagName || element?.name || '').toLowerCase();
  const className = node.attr('class') || '';
  const id = node.attr('id') || '';
  return {
    tag,
    role: inferComponentRole({ tag, className, id }),
    className,
    id: id || null,
    locator: buildElementLocator($, element),
  };
}

function dedupeConsecutive(components) {
  const output = [];
  for (const component of components) {
    const previous = output[output.length - 1];
    if (
      previous
      && previous.role === component.role
      && previous.tag === component.tag
      && previous.className === component.className
      && previous.locator?.fingerprint === component.locator?.fingerprint
    ) continue;
    output.push(component);
  }
  return output;
}

export function deriveComponentsFromHtml(html) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const components = [];

  $('body > header').each((_index, element) => {
    components.push(componentFromElement($, element));
  });

  let root = $('.project-single').first();
  if (!root.length) root = $('.page').first();
  if (!root.length) root = $('main').first();
  if (!root.length) root = $('body').first();

  root.children().each((_index, element) => {
    const node = $(element);
    const tag = String(element?.tagName || element?.name || '').toLowerCase();
    if (['script', 'style', 'noscript'].includes(tag)) return;
    if (tag === 'h1' && node.hasClass('sr-only')) return;

    const classes = (node.attr('class') || '').split(/\s+/);
    if (classes.includes('project_content')) {
      let children = node.children().filter((_i, child) => {
        const childTag = String(child?.tagName || child?.name || '').toLowerCase();
        return !['script', 'style', 'noscript'].includes(childTag);
      });

      while (children.length === 1 && $(children[0]).is('div')) {
        children = $(children[0]).children().filter((_i, child) => {
          const childTag = String(child?.tagName || child?.name || '').toLowerCase();
          return !['script', 'style', 'noscript'].includes(childTag);
        });
      }

      children.each((_i, child) => components.push(componentFromElement($, child)));
      return;
    }

    components.push(componentFromElement($, element));
  });

  $('body > footer').each((_index, element) => {
    components.push(componentFromElement($, element));
  });

  return dedupeConsecutive(components);
}

export function deriveComponentsFromSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => ({
    tag: String(section?.tag || 'section').toLowerCase(),
    role: inferComponentRole({
      tag: section?.tag,
      className: section?.className,
      id: section?.id,
    }),
    className: section?.className || '',
    id: section?.id || null,
    heading: section?.heading || null,
    locator: null,
  }));
}
