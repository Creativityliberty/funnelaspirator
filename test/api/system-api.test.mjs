import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { resolveDomainDir, findById } from '../../src/compiler/system-store.mjs';

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
