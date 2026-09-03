import fs from 'fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const pkg = JSON.parse(await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'));

test('package exposes the M02 rebuild CLI', () => {
  assert.equal(pkg.scripts.rebuild, 'node src/rebuild-cli.mjs');
});

test('rebuild CLI module exists and documents required arguments', async () => {
  const cliUrl = new URL('../../src/rebuild-cli.mjs', import.meta.url);
  const source = await fs.readFile(cliUrl, 'utf8');
  assert.match(source, /domain-export-dir/i);
  assert.match(source, /archetypeId/);
});
