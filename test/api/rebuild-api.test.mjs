import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSystemRoutes, injectRebuildBaseHref } from '../../src/system-http.mjs';

test('registerSystemRoutes exposes the M02 archetype rebuild HTTP facade', () => {
  const routes = [];
  const app = {
    get: (route, handler) => routes.push(`GET ${route}`),
    post: (route, handler) => routes.push(`POST ${route}`),
  };

  registerSystemRoutes(app, { exportsDir: '/tmp/exports' });

  assert.ok(routes.includes('POST /api/results/:domain/system/rebuild/archetypes/:archetypeId'));
  assert.ok(routes.includes('GET /api/results/:domain/system/rebuild/archetypes/:archetypeId'));
  assert.ok(routes.includes('GET /api/results/:domain/system/rebuild/archetypes/:archetypeId/preview'));
  assert.ok(routes.includes('GET /api/results/:domain/system/rebuild/archetypes/:archetypeId/report'));
});

test('rebuild preview injects a static export base so relative CSS JS and assets resolve', () => {
  const html = '<!doctype html><html><head><link rel="stylesheet" href="./styles/tokens.css"></head><body><script type="module" src="./app.js"></script></body></html>';
  const output = injectRebuildBaseHref(html, {
    domain: 'www.brandappart.com',
    archetypeId: 'arch-project-detail-2',
  });

  assert.match(output, /<base href="\/exports\/www\.brandappart\.com\/rebuild\/arch-project-detail-2\/">/);
  assert.match(output, /href="\.\/styles\/tokens\.css"/);
  assert.match(output, /src="\.\/app\.js"/);
});
