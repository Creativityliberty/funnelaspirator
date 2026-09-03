# M02 Reconstruction Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct one M01 site archetype into deterministic, autonomous, inspectable HTML/CSS/JS with M01-linked components, local assets, shared page data, integrity verification, Explorer preview, HTTP and MCP access.

**Architecture:** M02 first extends the M01 compiled model to schema v1.1 with source data paths and deterministic DOM locators. A focused `src/rebuild/` subsystem then resolves an archetype representative page, conservatively cleans and slices it, binds CSS/assets/data, builds a vanilla browser runtime in staging, verifies it, and only then publishes `exports/{domain}/rebuild/{archetypeId}/`. Existing crawl and `system/` evidence remain immutable.

**Tech Stack:** Node.js >=18, ES modules, Cheerio, Express 5, MCP SDK, Zod, browser ES modules, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-03-reconstruction-compiler-design.md`

## Global Constraints

- M02 is deterministic: no AI redesign, copy rewriting, React/Next/WordPress export or publishing.
- M02 target is vanilla HTML/CSS/JS served by Aspirator; `file://` compatibility is not required.
- Original `pages/`, `data/`, `assets/`, `screenshots/`, and `system/` evidence must never be modified by reconstruction.
- All source and output paths must remain inside `exports/{domain}`.
- Rebuilds are generated in staging and published only after required generation succeeds.
- External scripts, production form submission and tracking are disabled by default.
- Unknown DOM attributes are preserved unless a rule proves they are framework-only or unsafe.
- CSS pruning is conservative: retain relevant captured CSS when safe dependency removal cannot be proven.
- Font files are not generated or redistributed by M02.
- Brand Appart Project Detail is certification case one; Home is case two after Project Detail passes.
- Screenshot capture may aid human review, but automated visual similarity scoring remains M06.

---

## File Structure

```text
src/
├── compiler/
│   ├── schema.mjs
│   ├── load-export-v2.mjs
│   ├── compile-site.mjs
│   ├── components.mjs
│   └── html-components.mjs
├── rebuild/
│   ├── errors.mjs
│   ├── paths.mjs
│   ├── source-resolver.mjs
│   ├── dom-cleaner.mjs
│   ├── component-slicer.mjs
│   ├── css-compiler.mjs
│   ├── asset-binder.mjs
│   ├── data-extractor.mjs
│   ├── runtime-builder.mjs
│   ├── verifier.mjs
│   ├── rebuild-store.mjs
│   └── rebuild-archetype.mjs
├── rebuild-cli.mjs
├── system-http.mjs
├── system-mcp.mjs
└── test-mcp.mjs

public/
├── system-explorer.html
└── studio/
    ├── explorer.js
    ├── preview.js
    ├── system-inspector.js
    └── explorer.css

test/
├── helpers/
│   └── copy-fixture.mjs
├── compiler/
│   ├── site-system-v11.test.mjs
│   └── component-locators.test.mjs
├── rebuild/
│   ├── source-resolver.test.mjs
│   ├── dom-cleaner.test.mjs
│   ├── component-slicer.test.mjs
│   ├── css-compiler.test.mjs
│   ├── asset-binder.test.mjs
│   ├── data-extractor.test.mjs
│   ├── runtime-builder.test.mjs
│   ├── verifier.test.mjs
│   └── rebuild-archetype.test.mjs
└── api/
    ├── rebuild-api.test.mjs
    ├── rebuild-mcp.test.mjs
    └── explorer-contract.test.mjs
```

Generated output:

```text
exports/{domain}/rebuild/{archetypeId}/
├── rebuild-manifest.json
├── index.html
├── app.js
├── styles/
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   └── components.css
├── components/
│   └── registry.js
├── data/
│   ├── archetype.json
│   └── pages/*.json
├── assets/
└── reports/
    └── fidelity.json
```

---

### Task 1: Site-System v1.1 + Source Data Paths + Stable DOM Locators

**Files:**
- Modify: `src/compiler/schema.mjs`
- Modify: `src/compiler/load-export-v2.mjs`
- Modify: `src/compiler/compile-site.mjs`
- Modify: `src/compiler/components.mjs`
- Modify: `src/compiler/html-components.mjs`
- Create: `test/compiler/site-system-v11.test.mjs`
- Create: `test/compiler/component-locators.test.mjs`

**Interfaces:**
- Produces: `SITE_SYSTEM_VERSION === '1.1'`
- Normalized loaded page gains `dataPath: string | null` while retaining parsed `data` object.
- Public page gains `data: string | null` containing the original `data/*.json` relative path.
- Component source record gains `locator: { strategy, selector, ordinal, fingerprint }`.
- Component registry occurrence propagates `locator` unchanged.
- Existing v1.0 fields remain unchanged.

- [ ] **Step 1: Write the failing v1.1 page metadata test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { compileSiteSystem } from '../../src/compiler/compile-site.mjs';

const fixture = path.resolve('test/fixtures/mini-site');

test('site-system v1.1 exposes original page data paths', async () => {
  const system = await compileSiteSystem({ exportDir: fixture, write: false });
  const home = system.pages.find((page) => page.route === '/');
  assert.equal(system.version, '1.1');
  assert.equal(home.data, 'data/index.json');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/compiler/site-system-v11.test.mjs`

Expected: FAIL because current system version is `1.0` and public pages omit the data path.

- [ ] **Step 3: Retain the winning data ref in the loader and emit v1.1**

In `load-export-v2.mjs`, track the candidate that actually loaded:

```js
let pageData = null;
let dataPath = null;
for (const ref of candidateDataRefs(source)) {
  const candidate = assertInsideRoot(root, path.join(root, ref));
  const value = await readJsonIfExists(candidate);
  if (value) {
    pageData = value;
    dataPath = ref.split(path.sep).join('/');
    break;
  }
}
```

Add `dataPath` to the normalized page record. In `schema.mjs` set:

```js
export const SITE_SYSTEM_VERSION = '1.1';
```

In `compile-site.mjs` add:

```js
data: page.dataPath || null,
```

- [ ] **Step 4: Write failing locator tests using current HTML extraction**

```js
import { deriveComponentsFromHtml } from '../../src/compiler/html-components.mjs';

test('HTML components prefer a unique id locator then selector ordinal', () => {
  const components = deriveComponentsFromHtml(`
    <html><body><main>
      <section id="hero" class="project_hero">A</section>
      <section class="chapter">B</section>
      <section class="chapter">C</section>
    </main></body></html>
  `);
  const hero = components.find((item) => item.id === 'hero');
  const chapters = components.filter((item) => item.role === 'chapter');
  assert.equal(hero.locator.strategy, 'id');
  assert.equal(hero.locator.selector, '#hero');
  assert.equal(chapters[0].locator.strategy, 'selector-ordinal');
  assert.equal(chapters[0].locator.ordinal, 0);
  assert.equal(chapters[1].locator.ordinal, 1);
  assert.match(chapters[0].locator.fingerprint, /^[a-f0-9]{12}$/);
});
```

- [ ] **Step 5: Implement deterministic locator helpers**

Add local helpers in `html-components.mjs`:

```js
import crypto from 'crypto';

function cssEscape(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.codePointAt(0).toString(16)} `);
}

function normalizedClasses(value = '') {
  return String(value).split(/\s+/).filter(Boolean).sort().join(' ');
}

function elementFingerprint($, element) {
  const node = $(element);
  const payload = JSON.stringify({
    tag: String(element?.tagName || element?.name || '').toLowerCase(),
    id: node.attr('id') || '',
    classes: normalizedClasses(node.attr('class') || ''),
    childTags: node.children().toArray().map((child) => String(child.tagName || child.name || '').toLowerCase()),
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 12);
}
```

`buildElementLocator($, element)` must use this exact priority:

1. unique id;
2. tag + normalized class selector + ordinal among all matches;
3. structural strategy with fingerprint when selector construction is impossible.

`componentFromElement()` attaches `locator`, and `buildComponentRegistry()` copies `component.locator || null` into every occurrence.

- [ ] **Step 6: Run compiler regression suite**

Run: `node --test test/compiler/*.test.mjs`

Expected: all M01 + new v1.1 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/compiler test/compiler
git commit -m "feat(m02): add site-system v1.1 reconstruction metadata"
```

---

### Task 2: Rebuild Errors + Safe Paths + Source Resolver + v1.0 Fallback

**Files:**
- Create: `src/rebuild/errors.mjs`
- Create: `src/rebuild/paths.mjs`
- Create: `src/rebuild/source-resolver.mjs`
- Create: `test/helpers/copy-fixture.mjs`
- Create: `test/rebuild/source-resolver.test.mjs`

**Interfaces:**
- Produces: `RebuildError(code, message, details = null)`.
- Produces: `resolveRebuildPaths(domainDir, archetypeId) -> { rebuildRoot, stagingRoot }`.
- Produces: `resolveArchetypeSource({ domainDir, archetypeId })` returning `{ system, archetype, representativePage, sourceHtml, sourceData, componentOccurrences, styleRefs, assetRefs }`.
- Accepts site-system v1.1; supports v1.0 fallback without mutating/recompiling evidence.

- [ ] **Step 1: Create a reusable temp fixture helper**

```js
// test/helpers/copy-fixture.mjs
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export async function copyMiniSiteFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-m02-'));
  await fs.cp(path.resolve('test/fixtures/mini-site'), root, { recursive: true });
  return root;
}
```

- [ ] **Step 2: Write failing resolver tests with a real compiled fixture**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSiteSystem } from '../../src/compiler/compile-site.mjs';
import { copyMiniSiteFixture } from '../helpers/copy-fixture.mjs';
import { resolveArchetypeSource } from '../../src/rebuild/source-resolver.mjs';

test('resolver loads a representative archetype source', async () => {
  const domainDir = await copyMiniSiteFixture();
  const system = await compileSiteSystem({ exportDir: domainDir, write: true });
  const archetype = system.archetypes.find((item) => item.pageIds.length > 1);
  assert.ok(archetype, 'fixture must contain a reusable archetype');
  const source = await resolveArchetypeSource({ domainDir, archetypeId: archetype.id });
  assert.equal(source.archetype.id, archetype.id);
  assert.match(source.sourceHtml, /<html|<main|<body/i);
});

test('resolver rejects invalid archetype ids', async () => {
  const domainDir = await copyMiniSiteFixture();
  await assert.rejects(
    resolveArchetypeSource({ domainDir, archetypeId: '../../etc' }),
    (error) => error.code === 'INVALID_ARCHETYPE',
  );
});
```

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test test/rebuild/source-resolver.test.mjs`

Expected: module-not-found.

- [ ] **Step 4: Implement typed error codes**

```js
export class RebuildError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'RebuildError';
    this.code = code;
    this.details = details;
  }
}

export const REBUILD_CODES = Object.freeze({
  SOURCE_MISSING: 'SOURCE_MISSING',
  INVALID_ARCHETYPE: 'INVALID_ARCHETYPE',
  COMPONENT_UNRESOLVED: 'COMPONENT_UNRESOLVED',
  ASSET_UNRESOLVED: 'ASSET_UNRESOLVED',
  CSS_UNRESOLVED: 'CSS_UNRESOLVED',
  OUTPUT_ESCAPE: 'OUTPUT_ESCAPE',
  VERIFY_FAILED: 'VERIFY_FAILED',
});
```

- [ ] **Step 5: Implement path validation and source resolution**

Archetype ids must match:

```js
/^arch-[a-z0-9-]+$/i
```

Both `rebuildRoot` and `stagingRoot` are wrapped by existing `assertInsideRoot()`.

For v1.1 use `representativePage.data`. For v1.0, derive one candidate only from the representative HTML basename:

```js
const derivedDataPath = representativePage.html
  ? `data/${path.basename(representativePage.html, path.extname(representativePage.html))}.json`
  : null;
```

Read it only if it exists. Otherwise set `sourceData = {}`. Do not invent route-derived content.

- [ ] **Step 6: Run Task 2 + compiler tests**

Run: `node --test test/rebuild/source-resolver.test.mjs test/compiler/*.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/rebuild test/helpers test/rebuild
git commit -m "feat(m02): resolve safe archetype reconstruction sources"
```

---

### Task 3: Conservative DOM Cleaner + Locator-Based Component Slicer

**Files:**
- Create: `src/rebuild/dom-cleaner.mjs`
- Create: `src/rebuild/component-slicer.mjs`
- Create: `test/rebuild/dom-cleaner.test.mjs`
- Create: `test/rebuild/component-slicer.test.mjs`

**Interfaces:**
- Produces: `cleanRebuildDocument({ html, sourceUrl = '' }) -> { html, removed }`.
- Produces: `sliceComponents({ html, occurrences }) -> { components, residualHtml, unresolved }`.
- `components[]` records contain `{ componentId, role, variantId, markup, locator }`.

- [ ] **Step 1: Write DOM cleaner RED tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRebuildDocument } from '../../src/rebuild/dom-cleaner.mjs';

test('cleaner strips tracking and hydration while preserving accessible/data markup', () => {
  const result = cleanRebuildDocument({ html: `
    <html><body>
      <form action="https://example.com/lead"><button aria-label="Open" data-state="ready">Open</button></form>
      <script src="https://www.googletagmanager.com/gtm.js"></script>
      <script>self.__next_f.push([1,"payload"])</script>
    </body></html>
  ` });
  assert.doesNotMatch(result.html, /googletagmanager|__next_f/);
  assert.match(result.html, /aria-label="Open"/);
  assert.match(result.html, /data-state="ready"/);
  assert.match(result.html, /data-aspirator-original-action="https:\/\/example.com\/lead"/);
  assert.match(result.html, /action="#"/);
});
```

- [ ] **Step 2: Implement the conservative cleaner**

Tracking host pattern:

```js
const TRACKING_HOSTS = /googletagmanager|google-analytics|facebook\.net|posthog/i;
```

Remove scripts only when their `src` matches tracking hosts or inline text matches `self.__next_f` / `__NEXT_DATA__`. Neutralize form actions but preserve markup and original action in `data-aspirator-original-action`.

- [ ] **Step 3: Write slicer RED test using Task 1 locators**

```js
import { deriveComponentsFromHtml } from '../../src/compiler/html-components.mjs';
import { sliceComponents } from '../../src/rebuild/component-slicer.mjs';

test('slicer resolves derived locators and reports one explicit miss', () => {
  const html = '<html><body><main><section id="hero" class="hero">H</section><section class="chapter">A</section></main></body></html>';
  const derived = deriveComponentsFromHtml(html);
  const occurrences = derived.map((item, index) => ({
    componentId: `cmp-${index}`,
    role: item.role,
    variantId: null,
    locator: item.locator,
  }));
  occurrences.push({
    componentId: 'cmp-missing',
    role: 'missing',
    variantId: null,
    locator: { strategy: 'id', selector: '#does-not-exist', ordinal: 0, fingerprint: '000000000000' },
  });
  const result = sliceComponents({ html, occurrences });
  assert.equal(result.components.length, derived.length);
  assert.equal(result.unresolved.length, 1);
  assert.match(result.residualHtml, /data-aspirator-component=/);
});
```

- [ ] **Step 4: Implement locator resolution with fingerprint verification**

```js
function locate($, locator) {
  if (locator.strategy === 'id') return $(locator.selector).first();
  if (locator.strategy === 'selector-ordinal') return $(locator.selector).eq(locator.ordinal || 0);
  return findByStructuralFingerprint($, locator.fingerprint);
}
```

After locating, recompute the Task 1 fingerprint. Reject mismatches instead of silently selecting a different node.

Replace each successfully sliced root in a cloned page with:

```html
<div data-aspirator-component="cmp-id"></div>
```

Unclassified markup remains in `residualHtml`.

- [ ] **Step 5: Run Task 3 tests**

Run: `node --test test/rebuild/dom-cleaner.test.mjs test/rebuild/component-slicer.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/rebuild/dom-cleaner.mjs src/rebuild/component-slicer.mjs test/rebuild
git commit -m "feat(m02): clean captured DOM and slice located components"
```

---

### Task 4: CSS Dependency Compiler + Asset Binder

**Files:**
- Create: `src/rebuild/css-compiler.mjs`
- Create: `src/rebuild/asset-binder.mjs`
- Create: `test/rebuild/css-compiler.test.mjs`
- Create: `test/rebuild/asset-binder.test.mjs`
- Modify: `test/fixtures/mini-site/styles/site.css`

**Interfaces:**
- Produces: `compileStyles({ sourceHtml, sourceRoot, markup }) -> { outputs, referencedUrls, unresolved, mode }`.
- Produces: `bindAssets({ references, sourceRoot, rebuildRoot, assetRegistry = [] }) -> { assets, rewrites, external, unresolved }`.

- [ ] **Step 1: Extend fixture CSS with required dependency types**

Append to `test/fixtures/mini-site/styles/site.css`:

```css
:root { --m02-brand: #171412; }
.project-hero { background-image: url('../assets/hero.jpg'); animation: reveal 300ms ease; }
.project-hero:hover { transform: translateY(-2px); }
@media (max-width: 700px) { .project-hero { padding: 1rem; } }
@keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 2: Write CSS compiler RED test with concrete fixture paths**

```js
import fs from 'fs/promises';
import path from 'node:path';
import { compileStyles } from '../../src/rebuild/css-compiler.mjs';

test('CSS compiler preserves tokens pseudo media keyframes and URLs', async () => {
  const sourceRoot = path.resolve('test/fixtures/mini-site');
  const sourceHtml = await fs.readFile(path.join(sourceRoot, 'pages', 'work-alpha.html'), 'utf8');
  const result = await compileStyles({ sourceHtml, sourceRoot, markup: sourceHtml });
  assert.match(result.outputs.tokensCss, /--m02-brand/);
  assert.match(result.outputs.componentsCss, /project-hero:hover/);
  assert.match(result.outputs.componentsCss, /@media/);
  assert.match(result.outputs.componentsCss, /@keyframes reveal/);
  assert.ok(result.referencedUrls.some((value) => value.includes('hero.jpg')));
});
```

- [ ] **Step 3: Implement conservative stylesheet collection**

Collect local `<link rel="stylesheet">` and inline `<style>`. Emit deterministic strings:

- `tokensCss`: `:root` and `@font-face` declarations only;
- `baseCss`: html/body/reset/global element rules;
- `layoutCss`: page-shell layout rules;
- `componentsCss`: component/residual selectors plus required pseudo/media/keyframes.

If selector dependency analysis cannot prove safe pruning, include the entire local stylesheet in `componentsCss` and set `mode: 'conservative'`.

- [ ] **Step 4: Write asset binder RED test using temp output**

```js
import fs from 'fs/promises';
import os from 'os';
import path from 'node:path';
import { bindAssets } from '../../src/rebuild/asset-binder.mjs';

test('asset binder copies local assets and never fetches external resources', async () => {
  const sourceRoot = path.resolve('test/fixtures/mini-site');
  const rebuildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-assets-'));
  const result = await bindAssets({
    references: ['assets/hero.jpg', 'https://player.vimeo.com/video/1'],
    sourceRoot,
    rebuildRoot,
    assetRegistry: [],
  });
  assert.equal(result.assets.length, 1);
  assert.equal(result.external.length, 1);
  assert.equal(result.unresolved.length, 0);
  assert.equal(await fs.stat(path.join(rebuildRoot, result.assets[0].target)).then(() => true), true);
});
```

- [ ] **Step 5: Implement deterministic copy/rewrite behavior**

Use SHA-1 of source bytes for collision-safe names:

```js
const targetRel = path.posix.join('assets', `${hash.slice(0, 8)}-${path.basename(sourceRel)}`);
```

Do not copy remote URLs. Do not auto-copy font files; classify local font references as `font-reference` metadata for this milestone.

- [ ] **Step 6: Run Task 4 tests**

Run: `node --test test/rebuild/css-compiler.test.mjs test/rebuild/asset-binder.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/rebuild test/rebuild test/fixtures/mini-site/styles/site.css
git commit -m "feat(m02): compile styles and bind local rebuild assets"
```

---

### Task 5: Compatible Page Data Extraction + Vanilla Runtime Builder

**Files:**
- Create: `src/rebuild/data-extractor.mjs`
- Create: `src/rebuild/runtime-builder.mjs`
- Create: `test/rebuild/data-extractor.test.mjs`
- Create: `test/rebuild/runtime-builder.test.mjs`

**Interfaces:**
- Produces: `extractArchetypeData({ representativePage, representativeComponents, candidatePages }) -> { schema, pages, literals, excludedPageIds }`.
- Produces: `buildVanillaRuntime({ rebuildRoot, archetype, shellHtml, components, data, styles }) -> { generatedFiles, entry }`.

- [ ] **Step 1: Write concrete compatible/divergent data tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractArchetypeData } from '../../src/rebuild/data-extractor.mjs';

test('data extractor accepts matching component sequences and excludes divergent pages', () => {
  const representativePage = { id: 'page-001', title: 'Alpha', componentIds: ['cmp-hero', 'cmp-footer'] };
  const candidatePages = [
    { id: 'page-002', title: 'Beta', componentIds: ['cmp-hero', 'cmp-footer'], values: { heading: 'Beta project', image: 'assets/beta.jpg' } },
    { id: 'page-003', title: 'Broken', componentIds: ['cmp-hero', 'cmp-gallery', 'cmp-footer'], values: { heading: 'Broken' } },
  ];
  const result = extractArchetypeData({
    representativePage,
    representativeComponents: ['cmp-hero', 'cmp-footer'],
    candidatePages,
  });
  assert.equal(result.pages['page-002'].heading, 'Beta project');
  assert.deepEqual(result.excludedPageIds, ['page-003']);
});
```

- [ ] **Step 2: Implement compatibility before value lifting**

A candidate is compatible only when its required ordered component id sequence matches the representative required sequence. Do not compare marketing copy.

Safe value types for M02:

- text content;
- local/CTA `href`;
- media `src`, `poster`, `alt`;
- explicit page JSON fields already captured by M01.

When field mapping is ambiguous, preserve representative literal markup and do not expose a variable.

- [ ] **Step 3: Write runtime builder RED test with a temp rebuild root**

```js
import fs from 'fs/promises';
import os from 'os';
import path from 'node:path';
import { buildVanillaRuntime } from '../../src/rebuild/runtime-builder.mjs';

test('runtime builder emits browser ES modules without source hydration payloads', async () => {
  const rebuildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-runtime-'));
  const result = await buildVanillaRuntime({
    rebuildRoot,
    archetype: { id: 'arch-project-detail', representativePageId: 'page-001' },
    shellHtml: '<main><div data-aspirator-component="cmp-hero"></div></main>',
    components: [{ componentId: 'cmp-hero', markup: '<section class="hero">Hello</section>' }],
    data: { pages: { 'page-001': {} }, excludedPageIds: [] },
    styles: { tokensCss: ':root{}', baseCss: '', layoutCss: '', componentsCss: '.hero{}' },
  });
  const index = await fs.readFile(path.join(rebuildRoot, 'index.html'), 'utf8');
  const app = await fs.readFile(path.join(rebuildRoot, 'app.js'), 'utf8');
  assert.ok(result.generatedFiles.includes('index.html'));
  assert.match(index, /type="module"/);
  assert.doesNotMatch(index + app, /__NEXT_DATA__|self\.__next_f/);
});
```

- [ ] **Step 4: Implement deterministic component registry and runtime**

`components/registry.js` must export an object keyed by M01 component ids. M02 uses template strings; do not introduce a virtual DOM.

`app.js` must:

1. import registry/data;
2. select `?page=<pageId>` or representative default;
3. replace `data-aspirator-component` placeholders;
4. preserve local generated navigation;
5. post `{ type: 'aspirator:navigate', route }` when embedded.

- [ ] **Step 5: Run Task 5 tests**

Run: `node --test test/rebuild/data-extractor.test.mjs test/rebuild/runtime-builder.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/rebuild/data-extractor.mjs src/rebuild/runtime-builder.mjs test/rebuild
git commit -m "feat(m02): extract archetype data and build vanilla runtime"
```

---

### Task 6: Fidelity Verifier + Atomic Rebuild Orchestrator

**Files:**
- Create: `src/rebuild/verifier.mjs`
- Create: `src/rebuild/rebuild-store.mjs`
- Create: `src/rebuild/rebuild-archetype.mjs`
- Create: `test/rebuild/verifier.test.mjs`
- Create: `test/rebuild/rebuild-archetype.test.mjs`

**Interfaces:**
- Produces: `verifyRebuild({ domainDir, rebuildRoot, manifest, sourceHashes }) -> fidelityReport`.
- Produces: `rebuildArchetype({ domainDir, archetypeId }) -> rebuildManifest`.
- Produces: `readRebuildManifest(exportsDir, domain, archetypeId)` and `readRebuildReport(exportsDir, domain, archetypeId)`.

- [ ] **Step 1: Write verifier tests against an explicit small generated tree**

```js
import fs from 'fs/promises';
import os from 'os';
import path from 'node:path';
import { verifyRebuild } from '../../src/rebuild/verifier.mjs';

test('verifier reports zero broken references for intact output', async () => {
  const rebuildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aspirator-verify-'));
  await fs.mkdir(path.join(rebuildRoot, 'assets'), { recursive: true });
  await fs.writeFile(path.join(rebuildRoot, 'assets', 'hero.jpg'), 'x');
  await fs.writeFile(path.join(rebuildRoot, 'index.html'), '<img src="assets/hero.jpg">');
  const report = await verifyRebuild({
    domainDir: rebuildRoot,
    rebuildRoot,
    manifest: { componentIds: [], generatedFiles: ['index.html', 'assets/hero.jpg'] },
    sourceHashes: {},
  });
  assert.equal(report.status, 'pass');
  assert.equal(report.metrics.brokenLinks, 0);
});
```

Add a second test with `src="assets/missing.jpg"` and assert `status === 'fail'` and `metrics.brokenLinks === 1`.

- [ ] **Step 2: Implement required deterministic checks**

The report must contain named checks:

```js
{
  document,
  resources,
  components,
  navigation,
  sourceIntegrity,
  tracking,
  outputIsolation,
}
```

Capture hashes for source page HTML, page data and system manifest before generation. Compare after generation.

- [ ] **Step 3: Write orchestrator RED test using a copied fixture**

```js
import fs from 'fs/promises';
import path from 'node:path';
import { copyMiniSiteFixture } from '../helpers/copy-fixture.mjs';
import { compileSiteSystem } from '../../src/compiler/compile-site.mjs';
import { rebuildArchetype } from '../../src/rebuild/rebuild-archetype.mjs';

test('rebuildArchetype publishes verified staging output', async () => {
  const domainDir = await copyMiniSiteFixture();
  const system = await compileSiteSystem({ exportDir: domainDir, write: true });
  const archetype = system.archetypes.find((item) => item.pageIds.length > 1);
  assert.ok(archetype);
  const manifest = await rebuildArchetype({ domainDir, archetypeId: archetype.id });
  assert.equal(manifest.verification.status, 'pass');
  await fs.access(path.join(domainDir, 'rebuild', archetype.id, 'index.html'));
  await assert.rejects(fs.access(path.join(domainDir, 'rebuild', '.staging', archetype.id)));
});
```

- [ ] **Step 4: Implement exact orchestration order**

```text
resolve source
→ hash source evidence
→ clean DOM
→ slice components
→ extract compatible page data
→ compile CSS
→ bind assets
→ build runtime in staging
→ write preliminary manifest
→ verify staging
→ write reports/fidelity.json
→ PASS: atomically publish staging as rebuild root
→ FAIL: preserve previous published rebuild and throw VERIFY_FAILED
```

Use `fs.rename()` only within the same domain export filesystem. If an existing good rebuild exists, rename it to a temporary backup, publish staging, then delete backup; restore backup if publish fails.

- [ ] **Step 5: Emit canonical manifest**

```js
{
  version: '1.0',
  domain,
  archetypeId,
  representativePageId,
  target: 'vanilla',
  generatedFiles,
  componentIds,
  assetIds,
  pageIds,
  excludedPageIds,
  verification: {
    status,
    brokenResources,
    missingComponents,
  },
}
```

Do not place timestamps in ids, filenames or hash inputs.

- [ ] **Step 6: Run compiler + rebuild core tests**

Run: `node --test test/compiler/*.test.mjs test/rebuild/*.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/rebuild test/rebuild
git commit -m "feat(m02): orchestrate verified atomic archetype rebuilds"
```

---

### Task 7: CLI + HTTP + MCP Reconstruction Facades

**Files:**
- Create: `src/rebuild-cli.mjs`
- Modify: `package.json`
- Modify: `src/system-http.mjs`
- Modify: `src/system-mcp.mjs`
- Modify: `src/test-mcp.mjs`
- Create: `test/api/rebuild-api.test.mjs`
- Create: `test/api/rebuild-mcp.test.mjs`

**Interfaces:**
- CLI: `npm run rebuild -- <domain-export-dir> <archetypeId>`.
- HTTP:
  - `POST /api/results/:domain/system/rebuild/archetypes/:archetypeId`
  - `GET /api/results/:domain/system/rebuild/archetypes/:archetypeId`
  - `GET /api/results/:domain/system/rebuild/archetypes/:archetypeId/preview`
  - `GET /api/results/:domain/system/rebuild/archetypes/:archetypeId/report`
- MCP:
  - `rebuild_archetype`
  - `get_rebuild_manifest`
  - `get_rebuild_report`

- [ ] **Step 1: Write HTTP route registration RED test**

Follow the existing M01 route-capture pattern in `test/api/system-api.test.mjs` and assert these exact additions:

```js
assert.ok(routes.includes('POST /api/results/:domain/system/rebuild/archetypes/:archetypeId'));
assert.ok(routes.includes('GET /api/results/:domain/system/rebuild/archetypes/:archetypeId'));
assert.ok(routes.includes('GET /api/results/:domain/system/rebuild/archetypes/:archetypeId/preview'));
assert.ok(routes.includes('GET /api/results/:domain/system/rebuild/archetypes/:archetypeId/report'));
```

- [ ] **Step 2: Implement HTTP facade with fixed error mapping**

```js
const statusByCode = {
  SOURCE_MISSING: 404,
  INVALID_ARCHETYPE: 404,
  COMPONENT_UNRESOLVED: 422,
  ASSET_UNRESOLVED: 422,
  CSS_UNRESOLVED: 422,
  OUTPUT_ESCAPE: 400,
  VERIFY_FAILED: 422,
};
```

`preview` serves only the manifest-declared `index.html` resolved through rebuild path helpers. `report` returns parsed `reports/fidelity.json`.

- [ ] **Step 3: Write MCP RED test with required names**

```js
const required = new Set([
  'rebuild_archetype',
  'get_rebuild_manifest',
  'get_rebuild_report',
]);
for (const name of required) assert.ok(names.includes(name), `missing ${name}`);
```

- [ ] **Step 4: Implement MCP tools**

`rebuild_archetype`:

```js
annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
```

Manifest/report getters:

```js
annotations: { readOnlyHint: true, openWorldHint: false }
```

- [ ] **Step 5: Add the CLI**

`package.json`:

```json
"rebuild": "node src/rebuild-cli.mjs"
```

`src/rebuild-cli.mjs` must require exactly two positional arguments after Node/script, exit `1` with usage text when missing, call `rebuildArchetype()`, and print the published manifest path on success.

- [ ] **Step 6: Update MCP integration to 20 required named tools**

Keep the existing 17 required names and append the 3 M02 names. Verify names, not count alone.

- [ ] **Step 7: Run API + MCP contract tests**

Run: `node --test test/api/*.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/rebuild-cli.mjs src/system-http.mjs src/system-mcp.mjs src/test-mcp.mjs package.json test/api
git commit -m "feat(m02): expose archetype rebuild over CLI HTTP and MCP"
```

---

### Task 8: Explorer Original / Build / Rebuilt Workflow

**Files:**
- Modify: `public/system-explorer.html`
- Modify: `public/studio/explorer.js`
- Modify: `public/studio/preview.js`
- Modify: `public/studio/system-inspector.js`
- Modify: `public/studio/explorer.css`
- Create: `test/api/explorer-contract.test.mjs`

**Interfaces:**
- UI preview modes: `original | rebuilt`.
- `Build` is enabled only for selected archetypes in M02.
- Rebuilt preview URL: `/api/results/:domain/system/rebuild/archetypes/:archetypeId/preview?page=:pageId`.

- [ ] **Step 1: Write static Explorer contract RED test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';

test('Explorer exposes Original Build and Rebuilt controls', async () => {
  const html = await fs.readFile('public/system-explorer.html', 'utf8');
  assert.match(html, /data-preview-mode="original"/);
  assert.match(html, /id="rebuild-btn"/);
  assert.match(html, /data-preview-mode="rebuilt"/);
});
```

- [ ] **Step 2: Add exact controls**

```html
<div id="rebuild-controls" class="rebuild-controls">
  <button type="button" data-preview-mode="original">Original Preview</button>
  <button type="button" id="rebuild-btn">Build</button>
  <button type="button" data-preview-mode="rebuilt" disabled>Rebuilt Preview</button>
</div>
```

- [ ] **Step 3: Extend Explorer state**

```js
let state = {
  domain: '',
  system: null,
  selection: null,
  previewMode: 'original',
  rebuilds: new Map(),
};
```

- [ ] **Step 4: Implement Build action for selected archetype**

POST:

```js
`/api/results/${encodeURIComponent(state.domain)}/system/rebuild/archetypes/${encodeURIComponent(state.selection.value.id)}`
```

On success store the manifest in `state.rebuilds`, enable rebuilt preview and render verification data.

- [ ] **Step 5: Implement preview switching without replacing original evidence**

Original page preview keeps current M01 behavior. Rebuilt preview uses the M02 endpoint and labels the center pane `REBUILT`; switching back must restore `ORIGINAL` immediately.

- [ ] **Step 6: Extend inspector with factual rebuild fields**

Show:

- verification status;
- archetype id;
- resolved component count and expected count;
- resolved/referenced asset count;
- unresolved dependency count;
- button/link to report endpoint.

Do not show a visual-fidelity percentage.

- [ ] **Step 7: Run static/syntax checks**

```bash
node --test test/api/explorer-contract.test.mjs
node --check public/studio/explorer.js
node --check public/studio/preview.js
node --check public/studio/system-inspector.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add public test/api/explorer-contract.test.mjs
git commit -m "feat(m02): add original and rebuilt Explorer workflow"
```

---

### Task 9: General CI Gate + Brand Appart Project Detail Certification

**Files:**
- Create: `.github/workflows/verify.yml`
- Delete after replacement is confirmed: `.github/workflows/m01-ci.yml`
- Create only after running certification: `docs/m02-brandappart-certification.md`

**Interfaces:**
- CI runs syntax checks, `npm test`, real server readiness, and MCP integration with 20 required named tools.
- Brand Appart certification runs locally against the provided 40-page capture and records only observed results.

- [ ] **Step 1: Create general verification workflow before deleting M01-specific workflow**

The new workflow must run on PRs to `main` and pushes to `feat/**` branches. Required commands:

```bash
npm ci
node --check src/server.mjs
node --check src/rebuild/rebuild-archetype.mjs
node --check src/rebuild/runtime-builder.mjs
node --check src/rebuild/verifier.mjs
node --check src/rebuild-cli.mjs
npm test
```

Then start the server, wait for `http://127.0.0.1:3000/`, and run `npm run test:mcp`.

- [ ] **Step 2: Run the full suite locally or in the execution environment**

Run: `npm test`

Expected: all M01 + M02 tests PASS with zero failures.

- [ ] **Step 3: Run real server + MCP smoke**

```bash
npm run dev > /tmp/aspirator-server.log 2>&1 &
SERVER_PID=$!
for attempt in {1..20}; do
  curl --fail --silent http://127.0.0.1:3000/ >/dev/null && break
  sleep 1
done
npm run test:mcp
kill $SERVER_PID
```

Expected: initialize HTTP 200 and all 20 required legacy + M01 + M02 tool names present.

- [ ] **Step 4: Run Brand Appart certification on the real export**

Use the actual extracted Brand Appart domain directory as `BRANDAPPART_EXPORT` and execute:

```bash
npm run compile -- "$BRANDAPPART_EXPORT"
```

Read `system/archetypes.json`, choose the actual Project Detail archetype by its page membership/label, then run:

```bash
npm run rebuild -- "$BRANDAPPART_EXPORT" "$PROJECT_DETAIL_ARCHETYPE_ID"
```

Open the result through Aspirator's rebuilt preview endpoint, not `file://`.

- [ ] **Step 5: Verify certification requirements from generated evidence**

Check all of these directly from `rebuild-manifest.json`, `reports/fidelity.json`, and the source directories:

```text
Project Detail archetype identified
representative page rebuilt
at least one additional compatible Project Detail page available through shared runtime/data
all required local references resolved or exact misses reported
component ids trace back to M01 ids
source evidence hashes unchanged
fidelity report status PASS
human rebuilt preview reviewed
```

- [ ] **Step 6: Write certification document using only values observed in Step 5**

Create `docs/m02-brandappart-certification.md` only after the run. Record the exact run date, source page count, rebuilt page count, component expected/resolved counts, asset referenced/resolved counts, broken local reference count, source-integrity result, human preview result, and any exact unresolved items. Do not insert guessed or pre-filled numbers.

- [ ] **Step 7: Remove the old M01-only CI workflow after the new workflow passes once on the branch**

Delete `.github/workflows/m01-ci.yml` only after `verify.yml` has produced a successful run with equivalent M01 checks plus M02 checks.

- [ ] **Step 8: Open a draft PR**

Title:

```text
M02 — Reconstruction Compiler
```

PR body must include deterministic scope, site-system v1.1 compatibility, generated output contract, automated test evidence, Brand Appart certification evidence, known limitations, and current dependency-audit findings.

- [ ] **Step 9: Keep the PR draft until CI and review are clean**

Do not mark Ready or merge while required CI is red or while Critical/Important review findings remain unresolved.

- [ ] **Step 10: Commit certification/CI changes**

```bash
git add .github docs
git commit -m "test(m02): certify reconstruction compiler on Brand Appart"
```

---

## Final Acceptance Gate

M02 may be called complete only when every item is true:

```text
[ ] site-system v1.1 emitted and v1.0 fallback tested
[ ] deterministic component locators tested
[ ] Project Detail representative page rebuilt through one public compiler API
[ ] generated output served without source Next/React runtime
[ ] generated components reference M01 component ids
[ ] local CSS/assets resolve deterministically
[ ] at least two compatible archetype pages share one runtime/data model
[ ] original crawl/system evidence remains unchanged
[ ] fidelity report passes with zero broken local references
[ ] Explorer switches Original ↔ Rebuilt
[ ] HTTP + MCP + CLI reconstruction access works
[ ] MCP integration verifies 20 required named tools
[ ] Brand Appart Project Detail certification records real observed values
[ ] GitHub Actions PASS on the PR head
```

## Explicitly Deferred

```text
M03 — Identity Transformer / prompt-driven redesign
M04 — React / Next / Web Components / WordPress export
M05 — higher-level agentic reconstruction workflows
M06 — automated screenshot visual-diff scoring
```
