import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSiteExport } from '../../src/compiler/load-export.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, '..', 'fixtures', 'mini-site');

test('loadSiteExport loads sitemap and assigns stable page ids', async () => {
  const result = await loadSiteExport(fixture);
  assert.equal(result.domain, 'example.test');
  assert.equal(result.pages.length, 3);
  assert.equal(result.pages[0].id, 'page-001');
  assert.equal(result.pages[1].route, '/work/alpha');
});

test('loadSiteExport rejects a missing sitemap', async () => {
  await assert.rejects(() => loadSiteExport(path.join(fixture, 'missing')), /sitemap\.json/);
});
