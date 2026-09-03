import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSystemRoutes } from '../../src/system-http.mjs';

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
