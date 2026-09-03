import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { compileStyles } from '../../src/rebuild/css-compiler.mjs';

const sourceRoot = path.resolve('test/fixtures/mini-site');

test('CSS compiler preserves tokens pseudo media keyframes and URLs', async () => {
  const sourceHtml = await fs.readFile(path.join(sourceRoot, 'pages', 'work-alpha.html'), 'utf8');
  const result = await compileStyles({ sourceHtml, sourceRoot, markup: sourceHtml });
  assert.match(result.outputs.tokensCss, /--m02-brand/);
  assert.match(result.outputs.componentsCss, /project-hero:hover/);
  assert.match(result.outputs.componentsCss, /@media/);
  assert.match(result.outputs.componentsCss, /@keyframes reveal/);
  assert.ok(result.referencedUrls.some((value) => value.includes('hero.jpg')));
  assert.equal(result.mode, 'conservative');
  assert.deepEqual(result.unresolved, []);
});
