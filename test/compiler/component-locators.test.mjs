import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveComponentsFromHtml } from '../../src/compiler/html-components.mjs';
import { buildComponentRegistry } from '../../src/compiler/components.mjs';

test('component extraction prefers unique ids then selector ordinals', () => {
  const components = deriveComponentsFromHtml(`
    <html><body><main>
      <section id="hero" class="project-hero">Hero</section>
      <section class="chapter">A</section>
      <section class="chapter">B</section>
    </main></body></html>
  `);

  const hero = components.find((component) => component.id === 'hero');
  const chapters = components.filter((component) => component.className === 'chapter');

  assert.equal(hero.locator.strategy, 'id');
  assert.equal(hero.locator.selector, '#hero');
  assert.equal(hero.locator.ordinal, 0);
  assert.ok(hero.locator.fingerprint);

  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].locator.strategy, 'selector-ordinal');
  assert.equal(chapters[0].locator.selector, 'section.chapter');
  assert.equal(chapters[0].locator.ordinal, 0);
  assert.equal(chapters[1].locator.ordinal, 1);
});

test('component registry preserves source locators on occurrences', () => {
  const components = deriveComponentsFromHtml(`
    <html><body><main><section id="hero" class="project-hero">Hero</section></main></body></html>
  `);
  const registry = buildComponentRegistry([{ id: 'page-001', components }]);
  const occurrence = registry.find((item) => item.role === 'project-hero').occurrences[0];
  assert.deepEqual(occurrence.locator, components[0].locator);
});
