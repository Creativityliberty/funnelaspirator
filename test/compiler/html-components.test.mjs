import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveComponentsFromHtml } from '../../src/compiler/html-components.mjs';

test('HTML extractor expands Brand Appart project_content into structural components', () => {
  const html = `<!doctype html><html><body>
    <header class="header"></header>
    <div class="project-single">
      <div class="project_hero hero"></div>
      <nav class="project_toc"></nav>
      <div class="project_content u-section">
        <div class="container">
          <div class="overview"></div>
          <div class="project_gallery"></div>
          <div class="challenges"></div>
          <div class="chapter"></div>
          <div class="project_feedback row"></div>
          <div class="project_faq"></div>
          <div class="credits"></div>
          <aside class="project-aside"></aside>
        </div>
      </div>
      <a class="c-project-next"></a>
    </div>
    <footer class="footer"></footer>
  </body></html>`;

  const roles = deriveComponentsFromHtml(html).map((component) => component.role);
  assert.deepEqual(roles, [
    'header',
    'project-hero',
    'navigation',
    'overview',
    'gallery',
    'challenge',
    'chapter',
    'testimonial',
    'faq',
    'credits',
    'aside',
    'next-project',
    'footer',
  ]);
});
