import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPageSignature } from '../../src/compiler/page-signature.mjs';

const projectA = {
  route: '/work/alpha',
  components: [
    { tag: 'header', role: 'navigation', classes: 'site-header brand-alpha' },
    { tag: 'section', role: 'project-hero', classes: 'project-hero alpha' },
    { tag: 'section', role: 'gallery', classes: 'gallery alpha-gallery' },
    { tag: 'footer', role: 'contentinfo', classes: 'site-footer' },
  ],
  microInteractions: { ctas: [{ text: 'See Alpha' }] },
};

const projectB = {
  route: '/work/beta',
  components: [
    { tag: 'header', role: 'navigation', classes: 'site-header brand-beta' },
    { tag: 'section', role: 'project-hero', classes: 'project-hero beta' },
    { tag: 'section', role: 'gallery', classes: 'gallery beta-gallery' },
    { tag: 'footer', role: 'contentinfo', classes: 'site-footer' },
  ],
  microInteractions: { ctas: [{ text: 'See Beta' }] },
};

test('signature ignores copy and brand-specific class noise', () => {
  const a = buildPageSignature(projectA);
  const b = buildPageSignature(projectB);
  assert.deepEqual(a.sectionSequence, b.sectionSequence);
  assert.equal(a.structureHash, b.structureHash);
  assert.equal(a.routeDepth, 2);
  assert.equal(a.ctaCount, 1);
});
