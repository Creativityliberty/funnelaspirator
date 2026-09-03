import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildAssetRegistry } from '../../src/compiler/assets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, '..', 'fixtures', 'mini-site');

test('asset registry scans render assets but excludes data/pages/system', async () => {
  const assets = await buildAssetRegistry(fixture);
  assert.ok(assets.some((item) => item.path === 'assets/hero.jpg' && item.kind === 'image'));
  assert.ok(assets.some((item) => item.path === 'styles/site.css' && item.kind === 'style'));
  assert.equal(assets.some((item) => item.path.startsWith('data/')), false);
  assert.equal(assets.some((item) => item.path.startsWith('pages/')), false);
});
