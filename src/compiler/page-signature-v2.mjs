import crypto from 'crypto';

function normalizeRole(component = {}) {
  const raw = String(
    component.role || component.type || component.kind || component.tag || 'section',
  ).toLowerCase();

  if (raw.includes('nav')) return 'navigation';
  if (raw.includes('header')) return 'header';
  if (raw.includes('footer') || raw.includes('contentinfo')) return 'footer';
  if (raw.includes('hero')) return raw.includes('project') ? 'project-hero' : 'hero';
  if (raw.includes('gallery')) return 'gallery';
  if (raw.includes('testimonial') || raw.includes('feedback')) return 'testimonial';
  if (raw.includes('pricing') || raw.includes('price')) return 'pricing';
  if (raw.includes('form') || raw.includes('contact')) return 'form';
  if (raw.includes('grid') || raw.includes('list') || raw.includes('collection')) return 'collection';
  if (raw.includes('next')) return 'next-project';

  return raw
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function getRouteDepth(route = '/') {
  return String(route).split('?')[0].split('/').filter(Boolean).length;
}

function countFrom(primary, fallback) {
  if (Array.isArray(primary)) return primary.length;
  if (Array.isArray(fallback)) return fallback.length;
  return 0;
}

export function buildPageSignatureV2(page = {}) {
  const sectionSequence = (Array.isArray(page.components) ? page.components : []).map(normalizeRole);
  const ctaCount = countFrom(page.microInteractions?.ctas, page.data?.ctas);
  const formCount = Array.isArray(page.data?.forms)
    ? page.data.forms.length
    : sectionSequence.filter((item) => item === 'form').length;
  const routeDepth = getRouteDepth(page.route || '/');
  const stablePayload = JSON.stringify({ sectionSequence, ctaCount, formCount, routeDepth });

  return {
    sectionSequence,
    ctaCount,
    formCount,
    routeDepth,
    structureHash: crypto
      .createHash('sha256')
      .update(stablePayload)
      .digest('hex')
      .slice(0, 16),
  };
}
