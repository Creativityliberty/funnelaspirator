import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { resolveDomainDir, findById } from '../../src/compiler/system-store.mjs';
import { registerSystemRoutes } from '../../src/system-http.mjs';

test('domain resolution prevents traversal', () => {
  const root = path.resolve('/tmp/exports');
  assert.equal(resolveDomainDir(root, 'example.com'), path.join(root, 'example.com'));
  assert.throws(() => resolveDomainDir(root, '../etc'), /Invalid domain/);
});

test('manifest entity lookup is id-based', () => {
  const page = findById([{ id: 'page-001', route: '/' }], 'page-001', 'page');
  assert.equal(page.route, '/');
  assert.throws(() => findById([], 'page-999', 'page'), /page not found/);
});

test('registerSystemRoutes exposes M01 under a non-conflicting system namespace', () => {
  const routes = [];
  const app = {
    get: (route, handler) => routes.push(['GET', route, handler]),
    post: (route, handler) => routes.push(['POST', route, handler]),
  };
  registerSystemRoutes(app, { exportsDir: '/tmp/exports' });
  assert.equal(routes.length, 9);
  assert.ok(routes.some(([method, route]) => method === 'POST' && route === '/api/results/:domain/compile'));
  assert.ok(routes.some(([method, route]) => method === 'GET' && route === '/api/results/:domain/system'));
  assert.ok(routes.some(([method, route]) => method === 'GET' && route === '/api/results/:domain/system/components'));
  assert.ok(routes.some(([method, route]) => method === 'GET' && route === '/api/results/:domain/system/preview/:pageId'));
  assert.equal(routes.some(([method, route]) => method === 'GET' && route === '/api/results/:domain/components'), false);
});
