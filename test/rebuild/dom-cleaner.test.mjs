import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRebuildDocument, cleanRebuildFragment } from '../../src/rebuild/dom-cleaner.mjs';

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

test('fragment cleaner removes virtual Next srcsets and trackers without wrapping component markup', () => {
  const markup = `
    <section class="chapter">
      <img src="assets/local.jpg" srcset="/_next/image?url=https%3A%2F%2Fcdn.example.com%2Fhero.webp&w=1200&q=75 1200w" alt="Hero">
      <noscript><img src="https://www.facebook.com/tr?id=1&noscript=1" width="1" height="1"></noscript>
    </section>`;
  const result = cleanRebuildFragment({ html: markup });
  assert.match(result.html, /^\s*<section class="chapter">/);
  assert.doesNotMatch(result.html, /srcset=|\/_next\/image\?|facebook\.com\/tr/i);
  assert.match(result.html, /src="assets\/local\.jpg"/);
  assert.doesNotMatch(result.html, /<html|<body/i);
});

test('cleaner removes non-functional source hints, tracker noscript and hidden tracking pixels', () => {
  const result = cleanRebuildDocument({ html: `
    <html>
      <head>
        <link rel="preload" href="/_next/static/chunks/runtime.js" as="script">
        <link rel="modulepreload" href="/_next/static/chunks/app.js">
        <link rel="icon" href="/icon.png">
        <link rel="apple-touch-icon" href="/apple-icon.png">
        <link rel="stylesheet" href="./site.css">
      </head>
      <body>
        <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-X"></iframe></noscript>
        <noscript><img src="https://www.facebook.com/tr?id=1&noscript=1" width="1" height="1"></noscript>
        <img src="../assets/app.citeme.io/api/beacon/demo/pixel" width="1" height="1" style="position:absolute;width:0;height:0;overflow:hidden">
        <img src="../assets/site/hero.jpg" width="800" height="600" alt="Hero">
      </body>
    </html>
  ` });

  assert.doesNotMatch(result.html, /rel="(?:preload|modulepreload|icon|apple-touch-icon)"/i);
  assert.doesNotMatch(result.html, /googletagmanager|facebook\.com\/tr|citeme\.io/i);
  assert.match(result.html, /rel="stylesheet" href="\.\/site\.css"/);
  assert.match(result.html, /src="\.\.\/assets\/site\/hero\.jpg"/);
  assert.ok(result.removed.hints >= 4);
  assert.ok(result.removed.trackers >= 3);
});
