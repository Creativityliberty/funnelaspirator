import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileSiteSystem } from '../../src/compiler/compile-site.mjs';
import { resolveArchetypeSource } from '../../src/rebuild/source-resolver.mjs';

const fixture = path.resolve('test/fixtures/mini-site');

async function withCompiledFixture(run) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-m02-source-'));
  await fs.cp(fixture, temp, { recursive: true });
  try {
    const system = await compileSiteSystem({ exportDir: temp, write: true });
    const archetype = system.archetypes.find((item) => item.pageIds.length > 1);
    assert.ok(archetype, 'expected a multi-page archetype in mini-site fixture');
    await run({ temp, system, archetype });
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

test('resolver loads representative source and page data inside export root', async () => {
  await withCompiledFixture(async ({ temp, archetype }) => {
    const source = await resolveArchetypeSource({ domainDir: temp, archetypeId: archetype.id });
    assert.equal(source.archetype.id, archetype.id);
    assert.ok(source.sourceHtml.includes('<'));
    assert.match(source.sourceData.title, /Project/);
    assert.equal(source.representativePage.id, archetype.representativePageId);
    assert.ok(Array.isArray(source.componentOccurrences));
    assert.ok(Array.isArray(source.styleRefs));
    assert.ok(Array.isArray(source.assetRefs));
  });
});

test('resolver excludes executable scripts and hidden tracking pixels from render asset refs', async () => {
  await withCompiledFixture(async ({ temp, system, archetype }) => {
    const representative = system.pages.find((page) => page.id === archetype.representativePageId);
    const htmlPath = path.join(temp, representative.html);
    const html = await fs.readFile(htmlPath, 'utf8');
    await fs.writeFile(
      htmlPath,
      html.replace('</body>', `
        <script src="../assets/www.googletagmanager.com/gtag.js"></script>
        <img src="../assets/app.citeme.io/api/beacon/demo/pixel" width="1" height="1" style="position:absolute;width:0;height:0;overflow:hidden">
        <img src="assets/hero.jpg" width="800" height="600" alt="Hero">
      </body>`),
      'utf8',
    );

    const source = await resolveArchetypeSource({ domainDir: temp, archetypeId: archetype.id });
    assert.ok(source.assetRefs.includes('assets/hero.jpg'));
    assert.equal(source.assetRefs.some((ref) => /googletagmanager|citeme\.io/i.test(ref)), false);
  });
});

test('resolver rejects malformed archetype ids before filesystem interpolation', async () => {
  await withCompiledFixture(async ({ temp }) => {
    await assert.rejects(
      resolveArchetypeSource({ domainDir: temp, archetypeId: '../../etc' }),
      (error) => error.code === 'INVALID_ARCHETYPE',
    );
  });
});

test('resolver derives source data path for a v1.0 manifest when the file exists', async () => {
  await withCompiledFixture(async ({ temp, system, archetype }) => {
    const legacy = structuredClone(system);
    legacy.version = '1.0';
    const representative = legacy.pages.find((page) => page.id === archetype.representativePageId);
    delete representative.data;
    await fs.writeFile(
      path.join(temp, 'system', 'site-system.json'),
      `${JSON.stringify(legacy, null, 2)}\n`,
      'utf8',
    );

    const source = await resolveArchetypeSource({ domainDir: temp, archetypeId: archetype.id });
    assert.match(source.sourceData.title, /Project/);
    assert.match(source.sourceDataPath, /^data\/.+\.json$/);
  });
});
