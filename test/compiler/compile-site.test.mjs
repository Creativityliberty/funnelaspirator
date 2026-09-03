import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { compileSiteSystem } from '../../src/compiler/compile-site.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, '..', 'fixtures', 'mini-site');

test('compileSiteSystem builds pages, archetypes, components and assets', async () => {
  const system = await compileSiteSystem({ exportDir: fixture, write: false });
  assert.equal(system.domain, 'example.test');
  assert.equal(system.stats.pages, 3);
  assert.equal(system.stats.archetypes, 2);
  assert.ok(system.stats.components >= 5);
  assert.ok(system.stats.assets >= 2);
  const projects = system.pages.filter((page) => page.route.startsWith('/work/'));
  assert.equal(projects[0].archetypeId, projects[1].archetypeId);
});

test('compileSiteSystem writes manifests and normalized previews without mutating source pages', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-compiler-'));
  await fs.cp(fixture, temp, { recursive: true });

  const sourcePath = path.join(temp, 'pages', 'index.html');
  const dataPath = path.join(temp, 'data', 'index.json');
  const pageData = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  pageData.assets = [{
    type: 'image',
    attr: 'src',
    url: 'https://example.test/hero.jpg',
    localPath: 'exports/example.test/assets/hero.jpg',
  }];
  await fs.writeFile(dataPath, `${JSON.stringify(pageData, null, 2)}\n`, 'utf8');

  const original = await fs.readFile(sourcePath, 'utf8');
  const patched = original.replace('</body>', '<img src="/hero.jpg" alt="Captured root asset"></body>');
  await fs.writeFile(sourcePath, patched, 'utf8');
  const before = await fs.readFile(sourcePath, 'utf8');

  const system = await compileSiteSystem({ exportDir: temp, write: true });
  const preview = await fs.readFile(path.join(temp, system.pages[0].preview), 'utf8');
  const after = await fs.readFile(sourcePath, 'utf8');

  assert.equal(preview.includes('/_next/image?'), false);
  assert.equal(preview.includes('googletagmanager'), false);
  assert.equal(preview.includes('<base href="/exports/example.test/pages/">'), true);
  assert.equal(preview.includes('src="/exports/example.test/assets/hero.jpg"'), true);
  assert.equal(after, before);
  await fs.access(path.join(temp, 'system', 'site-system.json'));
});
