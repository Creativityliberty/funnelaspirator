import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { resolveDomainDir, findById } from '../../src/compiler/system-store.mjs';

test('resolveDomainDir rejects traversal and accepts hostnames', () => {
  const root = path.resolve('/tmp/exports');
  assert.equal(resolveDomainDir(root, 'example.com'), path.join(root, 'example.com'));
  assert.throws(() => resolveDomainDir(root, '../etc'), /Invalid domain/);
});

test('findById resolves manifest entities without using filesystem interpolation', () => {
  assert.equal(findById([{ id: 'page-001', route: '/' }], 'page-001', 'page').route, '/');
  assert.throws(() => findById([], 'page-999', 'page'), /page not found/);
});
