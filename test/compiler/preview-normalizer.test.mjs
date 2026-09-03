import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreviewHtml } from '../../src/compiler/preview-normalizer.mjs';

const html = `<!doctype html><html><head></head><body>
<img src="assets/hero.jpg" srcset="/_next/image?url=%2Fassets%2Fhero.jpg&w=1200&q=75 1200w" alt="Hero">
<a href="https://example.test/work/alpha">Alpha</a>
<script src="https://www.googletagmanager.com/gtag/js?id=TEST"></script>
<script>window.dataLayer = window.dataLayer || [];</script>
</body></html>`;

test('normalizer removes Next image optimizer srcset and tracking scripts', () => {
  const result = normalizePreviewHtml({ html, domain: 'example.test' });
  assert.equal(result.includes('/_next/image?'), false);
  assert.equal(result.includes('googletagmanager'), false);
  assert.equal(result.includes('dataLayer'), false);
  assert.equal(result.includes('src="assets/hero.jpg"'), true);
});

test('normalizer keeps same-domain navigation inside preview sandbox', () => {
  const result = normalizePreviewHtml({ html, domain: 'example.test' });
  assert.equal(result.includes('data-aspirator-route="/work/alpha"'), true);
  assert.equal(result.includes('href="#"'), true);
  assert.equal(result.includes('aspirator:navigate'), true);
});

test('normalizer can preserve page-relative captured assets after preview relocation', () => {
  const source = '<!doctype html><html><head></head><body><script src="../assets/site.js"></script><img src="../assets/hero.jpg"></body></html>';
  const result = normalizePreviewHtml({
    html: source,
    domain: 'example.test',
    baseHref: '/exports/example.test/pages/',
  });
  assert.match(result, /<base href="\/exports\/example\.test\/pages\/">/);
  assert.match(result, /src="\.\.\/assets\/site\.js"/);
  assert.equal(result.includes('data-aspirator-route="/exports/example.test/pages/"'), false);
});
