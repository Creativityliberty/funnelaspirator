import crypto from 'crypto';

function semanticRole(component = {}) {
  const raw = String(component.role || component.type || component.kind || component.tag || 'section').toLowerCase();
  if (raw.includes('nav')) return 'navigation';
  if (raw.includes('header')) return 'header';
  if (raw.includes('footer') || raw.includes('contentinfo')) return 'footer';
  if (raw.includes('hero')) return raw.includes('project') ? 'project-hero' : 'hero';
  if (raw.includes('gallery')) return 'gallery';
  if (raw.includes('testimonial')) return 'testimonial';
  if (raw.includes('price')) return 'pricing';
  if (raw.includes('form') || raw.includes('contact')) return 'form';
  if (raw.includes('grid') || raw.includes('collection') || raw.includes('list')) return 'collection';
  if (raw.includes('next')) return 'next-project';
  return raw.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
}

function labelFor(role) {
  const labels = {
    navigation: 'Navigation',
    header: 'Header',
    footer: 'Footer',
    hero: 'Hero',
    'project-hero': 'Project Hero',
    gallery: 'Gallery',
    testimonial: 'Testimonial',
    pricing: 'Pricing',
    form: 'Form / Conversion',
    collection: 'Collection / Grid',
    'next-project': 'Next Project',
  };
  return labels[role] || role.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function kindFor(role) {
  if (['navigation', 'header', 'footer'].includes(role)) return 'global';
  if (['form', 'pricing'].includes(role)) return 'conversion';
  if (['gallery', 'collection', 'hero', 'project-hero', 'testimonial', 'next-project'].includes(role)) return 'section';
  return 'content';
}

function normalizedClasses(value = '') {
  return String(value).split(/\s+/).filter(Boolean).sort().join(' ');
}

function variantHash(component) {
  const payload = JSON.stringify({
    tag: component.tag || '',
    classes: normalizedClasses(component.classes || component.className || ''),
    role: semanticRole(component),
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 10);
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function buildComponentRegistry(pages = []) {
  const groups = new Map();

  for (const page of pages) {
    const list = Array.isArray(page.components) ? page.components : [];
    list.forEach((component, index) => {
      const role = semanticRole(component);
      const tag = String(component.tag || '').toLowerCase();
      const key = `${role}:${tag || '*'}`;
      if (!groups.has(key)) {
        groups.set(key, {
          role,
          tag,
          occurrences: [],
          variants: new Map(),
          pageIds: new Set(),
        });
      }

      const group = groups.get(key);
      const occurrence = {
        pageId: page.id,
        index,
        role,
        tag,
        classes: component.classes || component.className || '',
        locator: component.locator || null,
        source: component,
      };
      group.occurrences.push(occurrence);
      group.pageIds.add(page.id);

      const hash = variantHash(component);
      if (!group.variants.has(hash)) {
        group.variants.set(hash, {
          id: `var-${hash}`,
          hash,
          classes: normalizedClasses(component.classes || component.className || ''),
          occurrences: 0,
        });
      }
      group.variants.get(hash).occurrences += 1;
    });
  }

  const counters = new Map();
  return [...groups.values()]
    .map((group) => {
      const label = labelFor(group.role);
      const base = slug(label);
      const count = (counters.get(base) || 0) + 1;
      counters.set(base, count);
      return {
        id: `cmp-${base}${count > 1 ? `-${count}` : ''}`,
        label,
        kind: kindFor(group.role),
        role: group.role,
        tag: group.tag,
        pageIds: [...group.pageIds],
        occurrences: group.occurrences,
        variants: [...group.variants.values()],
        confidence: group.pageIds.size > 1 ? 1 : 0.65,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
