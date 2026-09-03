import fs from 'fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const [html, explorer, preview, inspector] = await Promise.all([
  fs.readFile('public/system-explorer.html', 'utf8'),
  fs.readFile('public/studio/explorer.js', 'utf8'),
  fs.readFile('public/studio/preview.js', 'utf8'),
  fs.readFile('public/studio/system-inspector.js', 'utf8'),
]);

test('Explorer exposes Original Build and Rebuilt controls', () => {
  assert.match(html, /data-preview-mode="original"/);
  assert.match(html, /id="rebuild-btn"/);
  assert.match(html, /data-preview-mode="rebuilt"/);
});

test('Explorer keeps rebuild state and calls the isolated M02 endpoints', () => {
  assert.match(explorer, /previewMode:\s*'original'/);
  assert.match(explorer, /rebuilds:\s*new Map\(\)/);
  assert.match(explorer, /system\/rebuild\/archetypes/);
  assert.match(preview, /system\/rebuild\/archetypes/);
  assert.match(preview, /\?page=/);
});

test('Inspector renders factual rebuild metrics without a visual fidelity percentage', () => {
  assert.match(inspector, /componentsResolved/);
  assert.match(inspector, /componentsExpected/);
  assert.match(inspector, /assetsResolved/);
  assert.match(inspector, /assetsReferenced/);
  assert.doesNotMatch(inspector, /fidelity[^\n]{0,40}%/i);
});
