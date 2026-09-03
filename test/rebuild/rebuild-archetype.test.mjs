import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileSiteSystem } from '../../src/compiler/compile-site.mjs';
import { rebuildArchetype } from '../../src/rebuild/rebuild-archetype.mjs';

const fixture = path.resolve('test/fixtures/mini-site');

async function hashFile(file) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function copyFixture() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-m02-rebuild-'));
  await fs.cp(fixture, temp, { recursive: true });
  return temp;
}

test('rebuildArchetype publishes verified staging output without mutating source evidence', async () => {
  const domainDir = await copyFixture();
  try {
    const system = await compileSiteSystem({ exportDir: domainDir, write: true });
    const archetype = system.archetypes.find((item) => item.pageIds.length > 1);
    assert.ok(archetype, 'expected a shared project archetype');
    const sourcePage = system.pages.find((page) => page.id === archetype.representativePageId);
    const sourcePath = path.join(domainDir, sourcePage.html);
    const before = await hashFile(sourcePath);

    const manifest = await rebuildArchetype({ domainDir, archetypeId: archetype.id });

    assert.equal(manifest.verification.status, 'pass');
    assert.equal(manifest.archetypeId, archetype.id);
    assert.ok(manifest.pageIds.length >= 2);
    assert.ok(manifest.componentIds.length > 0);
    await fs.access(path.join(domainDir, 'rebuild', archetype.id, 'index.html'));
    await fs.access(path.join(domainDir, 'rebuild', archetype.id, 'reports', 'fidelity.json'));
    await assert.rejects(fs.access(path.join(domainDir, 'rebuild', '.staging', archetype.id)));
    assert.equal(await hashFile(sourcePath), before);
  } finally {
    await fs.rm(domainDir, { recursive: true, force: true });
  }
});

test('failed rebuild preserves the last known-good published output', async () => {
  const domainDir = await copyFixture();
  try {
    const system = await compileSiteSystem({ exportDir: domainDir, write: true });
    const archetype = system.archetypes.find((item) => item.pageIds.length > 1);
    const first = await rebuildArchetype({ domainDir, archetypeId: archetype.id });
    assert.equal(first.verification.status, 'pass');
    const marker = path.join(domainDir, 'rebuild', archetype.id, 'keep.txt');
    await fs.writeFile(marker, 'keep-me');

    const sourcePage = system.pages.find((page) => page.id === archetype.representativePageId);
    await fs.rm(path.join(domainDir, sourcePage.html));

    await assert.rejects(
      rebuildArchetype({ domainDir, archetypeId: archetype.id }),
      (error) => error.code === 'SOURCE_MISSING',
    );
    assert.equal(await fs.readFile(marker, 'utf8'), 'keep-me');
  } finally {
    await fs.rm(domainDir, { recursive: true, force: true });
  }
});
