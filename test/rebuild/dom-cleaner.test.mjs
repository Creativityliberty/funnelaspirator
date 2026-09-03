import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRebuildDocument } from '../../src/rebuild/dom-cleaner.mjs';

test('cleaner removes tracking/framework scripts while preserving accessible state', () => {
  const result = cleanRebuildDocument({ html: `
    <html><body>
      <button aria-label="Open" data-state="ready">Open</button>
      <script src="https://www.googletagmanager.com/gtm.js"></script>
      <script>self.__next_f.push([1,"payload"])</script>
      <script src="https://cdn.example.com/runtime.js"></script>
    </body></html>
  ` });
  assert.doesNotMatch(result.html, /googletagmanager|__next_f|runtime\.js/);
  assert.match(result.html, /aria-label="Open"/);
  assert.match(result.html, /data-state="ready"/);
  assert.ok(result.removed.scripts >= 3);
});

test('cleaner neutralizes production form actions but preserves the original target', () => {
  const result = cleanRebuildDocument({ html: `
    <html><body><form action="https://example.com/submit" method="post"><input name="x"></form></body></html>
  ` });
  assert.match(result.html, /action="#"/);
  assert.match(result.html, /data-aspirator-original-action="https:\/\/example\.com\/submit"/);
});

test('cleaner removes captured Next image optimizer srcsets while keeping local src evidence', () => {
  const result = cleanRebuildDocument({ html: `
    <html><body>
      <img src="../assets/www.example.com/_next/image-local.jpg" srcset="/_next/image?url=https%3A%2F%2Fcdn.example.com%2Fhero.webp&w=640&q=75 640w, /_next/image?url=https%3A%2F%2Fcdn.example.com%2Fhero.webp&w=1200&q=75 1200w" alt="Hero">
    </body></html>
  ` });
  assert.doesNotMatch(result.html, /srcset=/i);
  assert.match(result.html, /src="\.\.\/assets\/www\.example\.com\/_next\/image-local\.jpg"/);
});
