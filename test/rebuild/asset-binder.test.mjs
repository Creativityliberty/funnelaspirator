import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bindAssets } from '../../src/rebuild/asset-binder.mjs';

const sourceRoot = path.resolve('test/fixtures/mini-site');

test('asset binder copies local assets and never fetches external resources', async () => {
  const rebuildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-assets-'));
  try {
    const result = await bindAssets({
      references: ['assets/hero.jpg', 'https://player.vimeo.com/video/1'],
      sourceRoot,
      rebuildRoot,
      assetRegistry: [],
    });
    assert.equal(result.assets.length, 1);
    assert.equal(result.external.length, 1);
    assert.equal(result.unresolved.length, 0);
    assert.ok(result.rewrites['assets/hero.jpg']);
    await fs.access(path.join(rebuildRoot, result.assets[0].target));
  } finally {
    await fs.rm(rebuildRoot, { recursive: true, force: true });
  }
});

test('asset binder resolves captured ../assets references inside the export root', async () => {
  const rebuildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-assets-parent-'));
  try {
    const result = await bindAssets({
      references: ['../assets/hero.jpg'],
      sourceRoot,
      rebuildRoot,
      assetRegistry: [],
    });
    assert.equal(result.unresolved.length, 0);
    assert.equal(result.assets.length, 1);
    assert.ok(result.rewrites['../assets/hero.jpg']);
    await fs.access(path.join(rebuildRoot, result.assets[0].target));
  } finally {
    await fs.rm(rebuildRoot, { recursive: true, force: true });
  }
});

test('asset binder ignores virtual Next image optimizer srcset candidates', async () => {
  const rebuildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-assets-next-'));
  try {
    const result = await bindAssets({
      references: ['/_next/image?url=https%3A%2F%2Fcdn.example.com%2Fhero.webp&w=1200&q=75'],
      sourceRoot,
      rebuildRoot,
      assetRegistry: [],
    });
    assert.equal(result.unresolved.length, 0);
    assert.equal(result.assets.length, 0);
  } finally {
    await fs.rm(rebuildRoot, { recursive: true, force: true });
  }
});

test('asset binder never copies source executable scripts or known tracking captures', async () => {
  const tempSource = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-assets-tracking-source-'));
  const rebuildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-assets-tracking-output-'));
  try {
    await fs.mkdir(path.join(tempSource, 'assets', 'www.googletagmanager.com'), { recursive: true });
    await fs.mkdir(path.join(tempSource, 'assets', 'app.citeme.io'), { recursive: true });
    await fs.writeFile(path.join(tempSource, 'assets', 'www.googletagmanager.com', 'gtm.js'), 'tracking');
    await fs.writeFile(path.join(tempSource, 'assets', 'app.citeme.io', 'pixel'), 'pixel');

    const result = await bindAssets({
      references: [
        'assets/www.googletagmanager.com/gtm.js',
        'assets/app.citeme.io/pixel',
      ],
      sourceRoot: tempSource,
      rebuildRoot,
      assetRegistry: [],
    });

    assert.equal(result.assets.length, 0);
    assert.equal(result.unresolved.length, 0);
    assert.equal(result.external.length, 0);
    assert.deepEqual(result.ignored.sort(), [
      'assets/app.citeme.io/pixel',
      'assets/www.googletagmanager.com/gtm.js',
    ]);
  } finally {
    await fs.rm(tempSource, { recursive: true, force: true });
    await fs.rm(rebuildRoot, { recursive: true, force: true });
  }
});

test('asset binder reports missing local resources instead of inventing them', async () => {
  const rebuildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-assets-missing-'));
  try {
    const result = await bindAssets({
      references: ['assets/missing.png'],
      sourceRoot,
      rebuildRoot,
      assetRegistry: [],
    });
    assert.equal(result.assets.length, 0);
    assert.equal(result.unresolved.length, 1);
    assert.equal(result.unresolved[0].reference, 'assets/missing.png');
  } finally {
    await fs.rm(rebuildRoot, { recursive: true, force: true });
  }
});
