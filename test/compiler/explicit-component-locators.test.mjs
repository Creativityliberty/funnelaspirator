import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { compileSiteSystem } from '../../src/compiler/compile-site.mjs';

const fixture = path.resolve('test/fixtures/mini-site');

test('explicit crawler components inherit locators from captured HTML', async () => {
  const system = await compileSiteSystem({ exportDir: fixture, write: false });
  const page = system.pages.find((item) => item.route === '/work/alpha');
  assert.ok(page);
  const occurrences = system.components
    .flatMap((component) => component.occurrences || [])
    .filter((occurrence) => occurrence.pageId === page.id);
  assert.ok(occurrences.length >= 4);
  assert.ok(occurrences.every((occurrence) => occurrence.locator?.fingerprint));
});
