import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildVanillaRuntime } from '../../src/rebuild/runtime-builder.mjs';

test('runtime builder emits autonomous browser ES modules and deterministic data files', async () => {
  const rebuildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-runtime-'));
  try {
    const result = await buildVanillaRuntime({
      rebuildRoot,
      archetype: { id: 'arch-project-detail', representativePageId: 'page-001', pageIds: ['page-001', 'page-002'] },
      shellHtml: '<!doctype html><html><head></head><body><main><div data-aspirator-component="cmp-hero"></div></main></body></html>',
      components: [{ componentId: 'cmp-hero', role: 'hero', markup: '<section class="hero">Hello</section>' }],
      data: {
        schema: ['heading'],
        pages: { 'page-001': { heading: 'Alpha' }, 'page-002': { heading: 'Beta' } },
        excludedPageIds: [],
      },
      styles: { tokensCss: ':root{}', baseCss: 'body{}', layoutCss: '', componentsCss: '.hero{}' },
    });

    const index = await fs.readFile(path.join(rebuildRoot, 'index.html'), 'utf8');
    const app = await fs.readFile(path.join(rebuildRoot, 'app.js'), 'utf8');
    const registry = await fs.readFile(path.join(rebuildRoot, 'components', 'registry.js'), 'utf8');
    const dataRegistry = await fs.readFile(path.join(rebuildRoot, 'data', 'registry.js'), 'utf8');

    assert.ok(result.generatedFiles.includes('index.html'));
    assert.ok(result.generatedFiles.includes('app.js'));
    assert.match(index, /type="module"/);
    assert.match(index, /styles\/components\.css/);
    assert.match(registry, /cmp-hero/);
    assert.match(dataRegistry, /page-002/);
    assert.match(app, /URLSearchParams/);
    assert.match(app, /aspirator:navigate/);
    assert.doesNotMatch(index + app + registry, /__NEXT_DATA__|self\.__next_f/);
  } finally {
    await fs.rm(rebuildRoot, { recursive: true, force: true });
  }
});
