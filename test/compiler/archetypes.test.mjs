import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterPages } from '../../src/compiler/archetypes.mjs';

const pages = [
  { id: 'page-001', route: '/', components: [{ role: 'navigation' }, { role: 'hero' }, { role: 'collection' }, { role: 'contentinfo' }], microInteractions: { ctas: [] } },
  { id: 'page-002', route: '/work/alpha', components: [{ role: 'navigation' }, { role: 'project-hero' }, { role: 'gallery' }, { role: 'next-project' }, { role: 'contentinfo' }], microInteractions: { ctas: [] } },
  { id: 'page-003', route: '/work/beta', components: [{ role: 'navigation' }, { role: 'project-hero' }, { role: 'gallery' }, { role: 'next-project' }, { role: 'contentinfo' }], microInteractions: { ctas: [] } },
];

test('clusterPages groups structurally identical project pages', () => {
  const result = clusterPages(pages);
  assert.equal(result.length, 2);
  const project = result.find((item) => item.label === 'Project Detail');
  assert.ok(project);
  assert.deepEqual(project.pageIds, ['page-002', 'page-003']);
  assert.equal(project.representativePageId, 'page-002');
  assert.equal(project.confidence, 1);
});
