import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCompileTarget } from '../../src/compiler/compile-target.mjs';

test('compile target preserves explicit absolute export directories', () => {
  const target = resolveCompileTarget('/tmp/brandappart-export', {
    cwd: '/workspace',
    projectRoot: '/repo',
  });
  assert.deepEqual(target, {
    exportDir: path.resolve('/tmp/brandappart-export'),
    label: 'brandappart-export',
    mode: 'path',
  });
});

test('compile target keeps legacy domain lookup under project exports', () => {
  const target = resolveCompileTarget('www.brandappart.com', {
    cwd: '/workspace',
    projectRoot: '/repo',
  });
  assert.deepEqual(target, {
    exportDir: path.join('/repo', 'exports', 'www.brandappart.com'),
    label: 'www.brandappart.com',
    mode: 'domain',
  });
});

test('compile target accepts explicit relative directories without treating them as domains', () => {
  const target = resolveCompileTarget('./captures/brandappart', {
    cwd: '/workspace',
    projectRoot: '/repo',
  });
  assert.equal(target.exportDir, path.resolve('/workspace/captures/brandappart'));
  assert.equal(target.mode, 'path');
});
