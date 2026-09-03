import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveComponentsFromHtml } from '../../src/compiler/html-components.mjs';
import { sliceComponents } from '../../src/rebuild/component-slicer.mjs';

const html = `
<html><body><main>
  <section id="hero" class="project-hero">Hero</section>
  <section class="chapter">A</section>
  <section class="chapter">B</section>
</main></body></html>`;

test('slicer resolves id and ordinal locators and leaves component placeholders', () => {
  const derived = deriveComponentsFromHtml(html);
  const occurrences = derived.map((component, index) => ({
    componentId: `cmp-${index + 1}`,
    role: component.role,
    locator: component.locator,
  }));
  const result = sliceComponents({ html, occurrences });
  assert.equal(result.components.length, 3);
  assert.equal(result.unresolved.length, 0);
  assert.match(result.components[0].markup, /id="hero"/);
  assert.match(result.residualHtml, /data-aspirator-component="cmp-1"/);
  assert.match(result.residualHtml, /data-aspirator-component="cmp-2"/);
});

test('slicer reports unresolved locators instead of guessing', () => {
  const result = sliceComponents({
    html,
    occurrences: [{
      componentId: 'cmp-missing',
      role: 'chapter',
      locator: { strategy: 'id', selector: '#missing', ordinal: 0, fingerprint: 'deadbeef' },
    }],
  });
  assert.equal(result.components.length, 0);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].componentId, 'cmp-missing');
});
