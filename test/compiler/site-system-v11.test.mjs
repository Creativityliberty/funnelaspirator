import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { compileSiteSystem } from '../../src/compiler/compile-site.mjs';

const fixture = path.resolve('test/fixtures/mini-site');

test('site-system v1.1 exposes original page data paths', async () => {
  const system = await compileSiteSystem({ exportDir: fixture, write: false });
  assert.equal(system.version, '1.1');
  assert.equal(system.pages[0].data, 'data/index.json');
  assert.equal(system.pages[1].data, 'data/work-alpha.json');
});
