import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyRebuild } from '../../src/rebuild/verifier.mjs';

async function makeTree({ broken = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-verify-'));
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  await fs.mkdir(path.join(root, 'components'), { recursive: true });
  await fs.writeFile(path.join(root, 'assets', 'hero.jpg'), 'x');
  await fs.writeFile(path.join(root, 'components', 'registry.js'), "export const components = {'cmp-hero':'<section></section>'};\n");
  await fs.writeFile(path.join(root, 'app.js'), 'export {};\n');
  await fs.writeFile(
    path.join(root, 'index.html'),
    `<html><head><script type="module" src="./app.js"></script></head><body><img src="assets/${broken ? 'missing' : 'hero'}.jpg"></body></html>`,
  );
  return root;
}

test('verifier passes intact generated output', async () => {
  const rebuildRoot = await makeTree();
  try {
    const report = await verifyRebuild({
      domainDir: rebuildRoot,
      rebuildRoot,
      manifest: { componentIds: ['cmp-hero'], generatedFiles: ['index.html', 'app.js', 'assets/hero.jpg', 'components/registry.js'] },
      sourceHashes: {},
    });
    assert.equal(report.status, 'pass');
    assert.equal(report.metrics.brokenLinks, 0);
    assert.equal(report.metrics.componentsExpected, 1);
    assert.equal(report.metrics.componentsResolved, 1);
    assert.equal(report.visual.status, 'not-scored');
  } finally {
    await fs.rm(rebuildRoot, { recursive: true, force: true });
  }
});

test('verifier fails on a broken local reference', async () => {
  const rebuildRoot = await makeTree({ broken: true });
  try {
    const report = await verifyRebuild({
      domainDir: rebuildRoot,
      rebuildRoot,
      manifest: { componentIds: [], generatedFiles: ['index.html', 'app.js', 'assets/hero.jpg', 'components/registry.js'] },
      sourceHashes: {},
    });
    assert.equal(report.status, 'fail');
    assert.equal(report.metrics.brokenLinks, 1);
    assert.equal(report.checks.resources, 'fail');
  } finally {
    await fs.rm(rebuildRoot, { recursive: true, force: true });
  }
});

test('verifier detects mutated source evidence', async () => {
  const domainDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-source-integrity-'));
  const rebuildRoot = path.join(domainDir, 'rebuild-output');
  await fs.mkdir(rebuildRoot, { recursive: true });
  await fs.writeFile(path.join(rebuildRoot, 'index.html'), '<html><body></body></html>');
  await fs.writeFile(path.join(domainDir, 'evidence.txt'), 'before');
  const hash = crypto.createHash('sha256').update('before').digest('hex');
  await fs.writeFile(path.join(domainDir, 'evidence.txt'), 'after');
  try {
    const report = await verifyRebuild({
      domainDir,
      rebuildRoot,
      manifest: { componentIds: [], generatedFiles: ['index.html'] },
      sourceHashes: { 'evidence.txt': hash },
    });
    assert.equal(report.checks.sourceIntegrity, 'fail');
    assert.equal(report.status, 'fail');
  } finally {
    await fs.rm(domainDir, { recursive: true, force: true });
  }
});
