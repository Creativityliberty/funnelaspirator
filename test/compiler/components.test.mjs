import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComponentRegistry } from '../../src/compiler/components.mjs';

const pages = [
  {
    id: 'page-001',
    components: [
      { tag: 'header', role: 'navigation', classes: 'site-header home' },
      { tag: 'section', role: 'hero', classes: 'hero home-hero' },
      { tag: 'footer', role: 'contentinfo', classes: 'site-footer' },
    ],
  },
  {
    id: 'page-002',
    components: [
      { tag: 'header', role: 'navigation', classes: 'site-header project' },
      { tag: 'section', role: 'project-hero', classes: 'project-hero' },
      { tag: 'footer', role: 'contentinfo', classes: 'site-footer project' },
    ],
  },
];

test('registry merges reusable navigation and footer across pages', () => {
  const registry = buildComponentRegistry(pages);
  const navigation = registry.find((item) => item.label === 'Navigation');
  const footer = registry.find((item) => item.label === 'Footer');
  assert.ok(navigation);
  assert.ok(footer);
  assert.deepEqual(navigation.pageIds, ['page-001', 'page-002']);
  assert.equal(navigation.occurrences.length, 2);
  assert.equal(footer.occurrences.length, 2);
  assert.ok(navigation.variants.length >= 1);
});
