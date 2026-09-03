import test from 'node:test';
import assert from 'node:assert/strict';
import { extractArchetypeData } from '../../src/rebuild/data-extractor.mjs';

test('data extractor accepts matching component sequences and excludes divergent pages', () => {
  const representativePage = {
    id: 'page-001',
    title: 'Alpha',
    componentIds: ['cmp-hero', 'cmp-footer'],
    values: { heading: 'Alpha project', image: 'assets/alpha.jpg' },
  };
  const candidatePages = [
    { id: 'page-002', title: 'Beta', componentIds: ['cmp-hero', 'cmp-footer'], values: { heading: 'Beta project', image: 'assets/beta.jpg' } },
    { id: 'page-003', title: 'Broken', componentIds: ['cmp-hero', 'cmp-gallery', 'cmp-footer'], values: { heading: 'Broken' } },
  ];
  const result = extractArchetypeData({
    representativePage,
    representativeComponents: ['cmp-hero', 'cmp-footer'],
    candidatePages,
  });
  assert.equal(result.pages['page-001'].heading, 'Alpha project');
  assert.equal(result.pages['page-002'].heading, 'Beta project');
  assert.deepEqual(result.excludedPageIds, ['page-003']);
  assert.deepEqual(result.schema, ['heading', 'image']);
});

test('data extractor keeps only serializable safe page values', () => {
  const result = extractArchetypeData({
    representativePage: {
      id: 'page-001',
      componentIds: ['cmp-hero'],
      values: { heading: 'Hello', count: 3, enabled: true, nested: { alt: 'Hero' }, unsafe: () => 'x' },
    },
    representativeComponents: ['cmp-hero'],
    candidatePages: [],
  });
  assert.deepEqual(result.pages['page-001'], {
    heading: 'Hello', count: 3, enabled: true, nested: { alt: 'Hero' },
  });
});

test('data extractor removes known tracking URLs from runtime data without removing legitimate media', () => {
  const result = extractArchetypeData({
    representativePage: {
      id: 'page-001',
      componentIds: ['cmp-hero'],
      values: {
        heading: 'Concrete',
        image: '../assets/app.citeme.io/api/beacon/demo/pixel',
        poster: 'assets/project/poster.jpg',
        nested: {
          tracker: 'https://www.facebook.com/tr?id=123&noscript=1',
          caption: 'A real caption',
        },
      },
    },
    representativeComponents: ['cmp-hero'],
    candidatePages: [],
  });

  assert.deepEqual(result.pages['page-001'], {
    heading: 'Concrete',
    nested: { caption: 'A real caption' },
    poster: 'assets/project/poster.jpg',
  });
  assert.deepEqual(result.schema, ['heading', 'nested', 'poster']);
});
