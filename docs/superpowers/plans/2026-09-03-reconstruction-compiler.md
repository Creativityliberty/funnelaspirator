# M02 Reconstruction Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct an M01 site archetype into deterministic, autonomous, inspectable HTML/CSS/JS with reusable component boundaries, local assets, shared page data, integrity verification, Explorer preview, HTTP and MCP access.

**Architecture:** M02 extends the M01 compiled site model to schema v1.1 with source data paths and deterministic component locators. A new `src/rebuild/` subsystem reads the compiled system plus original captured artifacts, slices a representative archetype page conservatively, resolves styles/assets/data, writes into a staging directory, verifies the output, then atomically publishes `exports/{domain}/rebuild/{archetypeId}/`. Existing crawl and `system/` evidence remain immutable.

**Tech Stack:** Node.js >=18, ES modules, Cheerio, Express 5, MCP SDK, Zod, browser ES modules, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-03-reconstruction-compiler-design.md`

## Global Constraints

- M02 is deterministic: no AI redesign, copy rewriting, React/Next/WordPress export or publishing.
- M02 primary target is vanilla HTML/CSS/JS served by Aspirator; `file://` compatibility is not required.
- Original `pages/`, `data/`, `assets/`, `screenshots/`, and `system/` evidence must not be modified by reconstruction.
- All source and output filesystem paths must remain inside `exports/{domain}`.
- Rebuilds are written to staging and published only after required generation succeeds.
- External scripts, production form submission and tracking are disabled by default.
- Unknown DOM attributes are preserved unless a rule proves they are framework-only or unsafe.
- CSS pruning is conservative: keep a relevant captured stylesheet when safe dependency removal cannot be proven.
- Fonts are not generated or redistributed by M02.
- Brand Appart Project Detail is certification case one; Home is case two after Project Detail passes.
- M02 may capture screenshots for human comparison, but automated visual similarity scoring belongs to M06.

---

## File Structure

```text
src/
├── compiler/
│   ├── schema.mjs                    # bump site-system to v1.1
│   ├── compile-site.mjs              # expose page.data and v1.1 output
│   ├── components.mjs                # component occurrences carry locators
│   └── html-components.mjs           # derive deterministic DOM locators
├── rebuild/
│   ├── errors.mjs                    # typed M02 error codes
│   ├── paths.mjs                     # rebuild/staging path safety
│   ├── source-resolver.mjs           # resolve archetype/page/html/css/assets/data
│   ├── dom-cleaner.mjs               # conservative source-runtime removal
│   ├── component-slicer.mjs          # locator → source markup slices
│   ├── css-compiler.mjs              # safe stylesheet collection + URL rewrite
│   ├── asset-binder.mjs              # copy/map local referenced assets
│   ├── data-extractor.mjs            # page-variable content extraction
│   ├── runtime-builder.mjs           # index/app/component registry output
│   ├── verifier.mjs                  # deterministic integrity/fidelity checks
│   ├── rebuild-store.mjs             # read rebuild manifest/report
│   └── rebuild-archetype.mjs         # orchestrator + atomic publish
├── rebuild-cli.mjs                   # CLI facade
├── system-http.mjs                   # M02 HTTP facade
├── system-mcp.mjs                    # M02 MCP facade
└── test-mcp.mjs                      # registry count/names updated

public/studio/
├── explorer.js                       # Build + original/rebuilt mode
├── preview.js                        # preview source switch
├── system-inspector.js               # rebuild status/report
└── explorer.css                      # mode/status controls

public/system-explorer.html           # controls markup

test/
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
├── api/
│   ├── rebuild-api.test.mjs
│   └── rebuild-mcp.test.mjs
└── fixtures/mini-site/
    └── ...                            # extended project-detail fixture
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
│   └── ...
└── reports/
    └── fidelity.json
```

---

### Task 1: Site-System v1.1 Source Metadata + Stable Component Locators

**Files:**
- Modify: `src/compiler/schema.mjs`
- Modify: `src/compiler/compile-site.mjs`
- Modify: `src/compiler/components.mjs`
- Modify: `src/compiler/html-components.mjs`
- Create: `test/compiler/site-system-v11.test.mjs`
- Create: `test/compiler/component-locators.test.mjs`
- Modify: `test/fixtures/mini-site/pages/work-alpha.html`

**Interfaces:**
- Produces: `SITE_SYSTEM_VERSION === '1.1'`
- Produces: public page `{ data: 'data/<file>.json' | null }`
- Produces: occurrence locator `{ strategy, selector, ordinal, fingerprint }`
- Compatibility: M01 v1.0 consumers must continue reading existing fields unchanged.

- [ ] **Step 1: Write failing v1.1 page metadata test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { compileSiteSystem } from '../../src/compiler/compile-site.mjs';

const fixture = path.resolve('test/fixtures/mini-site');

test('site-system v1.1 exposes original page data paths', async () => {
  const system = await compileSiteSystem({ exportDir: fixture, write: false });
  assert.equal(system.version, '1.1');
  assert.equal(system.pages[0].data, 'data/index.json');
});
```

- [ ] **Step 2: Run it and verify RED**

Run: `node --test test/compiler/site-system-v11.test.mjs`

Expected: FAIL because current version is `1.0` and page records omit `data`.

- [ ] **Step 3: Add the minimal schema/page metadata change**

```js
// schema.mjs
export const SITE_SYSTEM_VERSION = '1.1';

// compile-site.mjs publicPage()
return {
  ...,
  data: page.dataPath || null,
};
```

If the loader currently does not retain the relative JSON path, extend its normalized page record with `dataPath` while keeping `page.data` as the parsed JSON object.

- [ ] **Step 4: Write failing locator tests**

```js
test('component occurrences use unique ids before selector ordinals', () => {
  const components = deriveComponentsFromHtml(`
    <main>
      <section id="hero" class="project_hero">A</section>
      <section class="chapter">B</section>
      <section class="chapter">C</section>
    </main>
  `);
  assert.equal(components[0].locator.strategy, 'id');
  assert.equal(components[0].locator.selector, '#hero');
  assert.equal(components[1].locator.strategy, 'selector-ordinal');
  assert.equal(components[2].locator.ordinal, 1);
});
```

- [ ] **Step 5: Implement deterministic locators**

Add a helper with exact priority:

```js
export function buildElementLocator($, element) {
  const node = $(element);
  const id = node.attr('id');
  if (id && $(`[id="${cssEscape(id)}"]`).length === 1) {
    return {
      strategy: 'id',
      selector: `#${cssEscape(id)}`,
      ordinal: 0,
      fingerprint: elementFingerprint($, element),
    };
  }

  const tag = String(element.tagName || element.name || '').toLowerCase();
  const classes = normalizedClasses(node.attr('class') || '');
  const selector = classes ? `${tag}.${classes.split(' ').map(cssEscape).join('.')}` : tag;
  const matches = $(selector).toArray();
  const ordinal = matches.indexOf(element);
  return {
    strategy: ordinal >= 0 ? 'selector-ordinal' : 'structural',
    selector,
    ordinal: Math.max(ordinal, 0),
    fingerprint: elementFingerprint($, element),
  };
}
```

Store `locator` on derived source components, then propagate it through `buildComponentRegistry()` occurrence records.

- [ ] **Step 6: Run compiler regression suite**

Run: `node --test test/compiler/*.test.mjs`

Expected: PASS, including existing M01 tests.

- [ ] **Step 7: Commit**

```bash
git add src/compiler test/compiler test/fixtures/mini-site
 git commit -m "feat(m02): add site-system v1.1 reconstruction metadata"
```

---

### Task 2: Rebuild Errors, Safe Paths, Source Resolver and v1.0 Fallback

**Files:**
- Create: `src/rebuild/errors.mjs`
- Create: `src/rebuild/paths.mjs`
- Create: `src/rebuild/source-resolver.mjs`
- Create: `test/rebuild/source-resolver.test.mjs`

**Interfaces:**
- Produces: `RebuildError(code, message, details?)`
- Produces: `resolveRebuildPaths(domainDir, archetypeId)`
- Produces: `resolveArchetypeSource({ domainDir, archetypeId })`
- Returns: `{ system, archetype, representativePage, sourceHtml, sourceData, componentOccurrences, styleRefs, assetRefs }`

- [ ] **Step 1: Write failing source resolver tests**

```js
test('resolver loads representative source and never escapes export root', async () => {
  const source = await resolveArchetypeSource({
    domainDir: fixture,
    archetypeId: knownArchetypeId,
  });
  assert.ok(source.sourceHtml.includes('<'));
  assert.equal(source.archetype.id, knownArchetypeId);
});

test('resolver rejects unknown archetypes with INVALID_ARCHETYPE', async () => {
  await assert.rejects(
    resolveArchetypeSource({ domainDir: fixture, archetypeId: '../../etc' }),
    (error) => error.code === 'INVALID_ARCHETYPE' || error.code === 'OUTPUT_ESCAPE',
  );
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/rebuild/source-resolver.test.mjs`

Expected: module-not-found.

- [ ] **Step 3: Implement typed error codes**

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

- [ ] **Step 4: Implement safe rebuild paths**

```js
export function resolveRebuildPaths(domainDir, archetypeId) {
  const safeId = String(archetypeId);
  if (!/^arch-[a-z0-9-]+$/i.test(safeId)) {
    throw new RebuildError('INVALID_ARCHETYPE', `Invalid archetype id: ${safeId}`);
  }
  const rebuildRoot = assertInsideRoot(domainDir, path.join(domainDir, 'rebuild', safeId));
  const stagingRoot = assertInsideRoot(domainDir, path.join(domainDir, 'rebuild', '.staging', safeId));
  return { rebuildRoot, stagingRoot };
}
```

- [ ] **Step 5: Implement v1.1 read + v1.0 fallback**

The resolver must use `page.data` when present. For a v1.0 manifest, derive `data/<basename>.json` from the page HTML or route only if that file exists; otherwise return `sourceData: {}` rather than inventing content.

- [ ] **Step 6: Run tests**

Run: `node --test test/rebuild/source-resolver.test.mjs test/compiler/*.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/rebuild test/rebuild
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
- Produces: `cleanRebuildDocument({ html, sourceUrl }) -> { html, removed }`
- Produces: `sliceComponents({ html, occurrences }) -> { components, residualHtml, unresolved }`

- [ ] **Step 1: Write DOM cleaner RED tests**

```js
test('cleaner removes tracking and Next hydration but preserves aria/data attributes', () => {
  const result = cleanRebuildDocument({ html: `
    <html><body>
      <button aria-label="Open" data-state="ready">Open</button>
      <script src="https://www.googletagmanager.com/gtm.js"></script>
      <script>self.__next_f.push([1,"payload"])</script>
    </body></html>
  ` });
  assert.doesNotMatch(result.html, /googletagmanager|__next_f/);
  assert.match(result.html, /aria-label="Open"/);
  assert.match(result.html, /data-state="ready"/);
});
```

- [ ] **Step 2: Implement conservative cleaner**

Rules must be allow-by-proof, not allow-by-guess:

```js
const TRACKING_HOSTS = /googletagmanager|google-analytics|facebook\.net|posthog/i;

$('script').each((_i, el) => {
  const node = $(el);
  const src = node.attr('src') || '';
  const text = node.html() || '';
  if (TRACKING_HOSTS.test(src) || /self\.__next_f|__NEXT_DATA__/.test(text)) {
    node.remove();
  }
});
```

Forms keep markup but get production actions neutralized:

```js
$('form[action]').attr('data-aspirator-original-action', (_i, value) => value).attr('action', '#');
```

- [ ] **Step 3: Write slicer RED tests**

```js
test('slicer resolves id and ordinal locators and reports misses', () => {
  const result = sliceComponents({
    html: '<main><section id="hero">H</section><section class="chapter">A</section></main>',
    occurrences: [heroOccurrence, chapterOccurrence, missingOccurrence],
  });
  assert.equal(result.components.length, 2);
  assert.equal(result.unresolved.length, 1);
  assert.match(result.components[0].markup, /id="hero"/);
});
```

- [ ] **Step 4: Implement locator resolution**

```js
function locate($, locator) {
  if (locator.strategy === 'id') return $(locator.selector).first();
  if (locator.strategy === 'selector-ordinal') return $(locator.selector).eq(locator.ordinal || 0);
  return findByStructuralFingerprint($, locator.fingerprint);
}
```

Verify the located node fingerprint before accepting it. A mismatch becomes unresolved; do not silently take another node.

- [ ] **Step 5: Preserve residual page shell**

Clone the cleaned page and replace successfully sliced roots with deterministic placeholders:

```html
<div data-aspirator-component="cmp-project-hero"></div>
```

Everything not confidently sliced stays in `residualHtml`.

- [ ] **Step 6: Run tests**

Run: `node --test test/rebuild/dom-cleaner.test.mjs test/rebuild/component-slicer.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

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
- Extend: `test/fixtures/mini-site/styles/site.css`
- Add fixture assets under: `test/fixtures/mini-site/assets/`

**Interfaces:**
- Produces: `compileStyles({ sourceHtml, sourceRoot, rebuildRoot, markup })`
- Returns: `{ files, referencedUrls, unresolved }`
- Produces: `bindAssets({ references, sourceRoot, rebuildRoot, assetRegistry })`
- Returns: `{ assets, rewrites, unresolved }`

- [ ] **Step 1: Extend fixture CSS**

Include tokens, media query, pseudo-state, keyframes and asset URL:

```css
:root { --brand: #171412; }
.project_hero { background-image: url('../assets/hero.jpg'); }
.project_hero:hover { transform: translateY(-2px); }
@media (max-width: 700px) { .project_hero { padding: 1rem; } }
@keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 2: Write CSS compiler RED test**

```js
test('css compiler preserves variables media pseudo rules and referenced keyframes', async () => {
  const result = await compileStyles({...fixtureArgs});
  const css = result.outputs.componentsCss;
  assert.match(result.outputs.tokensCss, /--brand/);
  assert.match(css, /project_hero:hover/);
  assert.match(css, /@media/);
  assert.match(css, /@keyframes reveal/);
});
```

- [ ] **Step 3: Implement conservative stylesheet collection**

Collect `<link rel="stylesheet">` and local `<style>` blocks. Split output deterministically:

- `tokens.css`: `:root`, `@font-face` declarations without copying font bytes;
- `base.css`: reset/body/html/global element rules;
- `layout.css`: page-shell/layout rules;
- `components.css`: rules matching component/residual markup, plus dependent media/keyframes/pseudo rules.

If selector matching cannot be parsed safely, retain the containing captured stylesheet in `components.css` and record `mode: 'conservative'` in metadata.

- [ ] **Step 4: Write asset binder RED tests**

```js
test('asset binder copies referenced local files and records external resources without fetching', async () => {
  const result = await bindAssets({
    references: ['../assets/hero.jpg', 'https://player.vimeo.com/video/1'],
    ...fixtureArgs,
  });
  assert.equal(result.assets.length, 1);
  assert.equal(result.external.length, 1);
  assert.equal(result.unresolved.length, 0);
});
```

- [ ] **Step 5: Implement asset copy + rewrite map**

All copied paths must be content-address-stable enough to avoid collisions but human-readable:

```js
const targetRel = path.posix.join('assets', `${hash.slice(0, 8)}-${path.basename(sourceRel)}`);
```

Do not copy fonts automatically. Classify them as `font-reference` and leave them unresolved/metadata-only unless the source file is explicitly allowed by a future policy.

- [ ] **Step 6: Run tests**

Run: `node --test test/rebuild/css-compiler.test.mjs test/rebuild/asset-binder.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/rebuild test/rebuild test/fixtures/mini-site
 git commit -m "feat(m02): compile styles and bind local reconstruction assets"
```

---

### Task 5: Page Data Extraction + Vanilla Runtime Builder

**Files:**
- Create: `src/rebuild/data-extractor.mjs`
- Create: `src/rebuild/runtime-builder.mjs`
- Create: `test/rebuild/data-extractor.test.mjs`
- Create: `test/rebuild/runtime-builder.test.mjs`

**Interfaces:**
- Produces: `extractArchetypeData({ representative, compatiblePages, slices })`
- Returns: `{ schema, pages, literals, excluded }`
- Produces: `buildVanillaRuntime({ rebuildRoot, archetype, shell, components, data, styles, assets })`
- Returns: `{ generatedFiles, entry: 'index.html' }`

- [ ] **Step 1: Write conservative data extraction RED test**

```js
test('extractor lifts text/image values only when structure matches', () => {
  const result = extractArchetypeData({ representative, compatiblePages });
  assert.equal(result.pages['page-002'].title, 'Beta project');
  assert.equal(result.excluded.length, 0);
});
```

Add a divergent page case and assert it is excluded instead of coerced.

- [ ] **Step 2: Implement compatibility check**

A compatible page must match the representative component sequence and required locator roles. Use M01 signatures and component ids; do not compare marketing copy.

- [ ] **Step 3: Implement safe value lifting**

Start only with:

- text-node content inside resolved components;
- `href` for local/CTA links;
- `src`, `poster`, `alt` for media;
- explicit page JSON fields already captured by M01.

If node counts/roles diverge, keep literal representative markup and mark the field non-variable.

- [ ] **Step 4: Write runtime builder RED test**

```js
test('runtime builder emits browser-loadable ES module output without source framework runtime', async () => {
  const result = await buildVanillaRuntime({...args});
  assert.ok(result.generatedFiles.includes('index.html'));
  const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  assert.match(index, /type="module"/);
  assert.doesNotMatch(index, /__NEXT_DATA__|self\.__next_f/);
});
```

- [ ] **Step 5: Generate deterministic component registry**

`components/registry.js` exports pure render functions keyed by M01 ids:

```js
export const components = {
  'cmp-project-hero': ({ markup }) => markup,
  'cmp-footer': ({ markup }) => markup,
};
```

For M02, markup may remain template strings. Do not introduce a custom virtual DOM.

- [ ] **Step 6: Generate runtime composition**

`app.js` loads `data/archetype.json`, chooses the page from `?page=<pageId>` or the representative default, replaces `data-aspirator-component` placeholders, restores supported local navigation, and posts `aspirator:navigate` when embedded.

- [ ] **Step 7: Run tests**

Run: `node --test test/rebuild/data-extractor.test.mjs test/rebuild/runtime-builder.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/rebuild/data-extractor.mjs src/rebuild/runtime-builder.mjs test/rebuild
 git commit -m "feat(m02): extract archetype data and build vanilla runtime"
```

---

### Task 6: Fidelity Verifier + Atomic Reconstruction Orchestrator

**Files:**
- Create: `src/rebuild/verifier.mjs`
- Create: `src/rebuild/rebuild-archetype.mjs`
- Create: `src/rebuild/rebuild-store.mjs`
- Create: `test/rebuild/verifier.test.mjs`
- Create: `test/rebuild/rebuild-archetype.test.mjs`

**Interfaces:**
- Produces: `verifyRebuild({ domainDir, rebuildRoot, manifest, sourceSnapshot })`
- Produces: `rebuildArchetype({ domainDir, archetypeId, options? })`
- Returns canonical `rebuild-manifest.json` data.
- Produces: `readRebuildManifest(exportsDir, domain, archetypeId)` and `readRebuildReport(...)`.

- [ ] **Step 1: Write verifier RED test**

```js
test('verifier fails broken local references and passes intact output', async () => {
  const report = await verifyRebuild({...fixtureArgs});
  assert.equal(report.status, 'pass');
  assert.equal(report.metrics.brokenLinks, 0);
});
```

Add a missing image fixture and assert `status === 'fail'` with an `ASSET_UNRESOLVED`-classified issue.

- [ ] **Step 2: Implement deterministic checks**

Checks must cover exactly:

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

Capture hashes of source evidence before generation and compare after generation.

- [ ] **Step 3: Write orchestrator RED test**

```js
test('rebuildArchetype publishes only verified staging output', async () => {
  const manifest = await rebuildArchetype({ domainDir: fixture, archetypeId });
  assert.equal(manifest.verification.status, 'pass');
  assert.ok(await exists(path.join(fixture, 'rebuild', archetypeId, 'index.html')));
  assert.equal(await exists(path.join(fixture, 'rebuild', '.staging', archetypeId)), false);
});
```

- [ ] **Step 4: Implement orchestration pipeline**

Exact order:

```text
resolve source
→ clean DOM
→ slice components
→ extract compatible page data
→ compile CSS
→ bind assets
→ build runtime in staging
→ write preliminary manifest
→ verify staging
→ write fidelity report
→ if pass: atomically replace published rebuild
→ if fail: retain last good published rebuild, return VERIFY_FAILED
```

- [ ] **Step 5: Implement rebuild manifest**

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

Do not include nondeterministic timestamps in identities or filenames.

- [ ] **Step 6: Run all core tests**

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
- CLI: `npm run rebuild -- <domain-export-dir> <archetypeId>`
- HTTP:
  - `POST /api/results/:domain/system/rebuild/archetypes/:archetypeId`
  - `GET /api/results/:domain/system/rebuild/archetypes/:archetypeId`
  - `GET /api/results/:domain/system/rebuild/archetypes/:archetypeId/preview`
  - `GET /api/results/:domain/system/rebuild/archetypes/:archetypeId/report`
- MCP:
  - `rebuild_archetype`
  - `get_rebuild_manifest`
  - `get_rebuild_report`

- [ ] **Step 1: Write HTTP contract RED test**

```js
test('system HTTP registers non-conflicting M02 rebuild routes', () => {
  const routes = collectRegisteredRoutes();
  assert.ok(routes.includes('POST /api/results/:domain/system/rebuild/archetypes/:archetypeId'));
  assert.ok(routes.includes('GET /api/results/:domain/system/rebuild/archetypes/:archetypeId/preview'));
});
```

- [ ] **Step 2: Implement HTTP facade with error mapping**

Map:

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

Use `res.sendFile()` only after resolving manifest-declared paths through safe rebuild helpers.

- [ ] **Step 3: Write MCP RED test**

```js
test('M02 registers exactly three reconstruction tools', () => {
  const names = registeredToolNames();
  assert.deepEqual(names.filter((name) => name.includes('rebuild')), [
    'rebuild_archetype',
    'get_rebuild_manifest',
    'get_rebuild_report',
  ]);
});
```

The assertion may use an explicit required-name set rather than substring filtering if legacy names overlap.

- [ ] **Step 4: Implement MCP tools**

`rebuild_archetype` is write-capable but non-destructive to source evidence:

```js
annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
```

Manifest/report getters are read-only.

- [ ] **Step 5: Add CLI script**

```json
"rebuild": "node src/rebuild-cli.mjs"
```

CLI usage must exit non-zero on failure and print the manifest path on success.

- [ ] **Step 6: Update MCP integration expected registry**

M01 had 17 required tools. M02 adds 3, so the integration test must verify the 20 named required tools instead of relying only on count.

- [ ] **Step 7: Run API/MCP tests**

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
- UI modes: `original | rebuilt`
- Action: `buildSelectedArchetype()`
- Preview source: original M01 preview or M02 rebuild preview.

- [ ] **Step 1: Write static Explorer contract RED test**

```js
test('Explorer exposes Original Build and Rebuilt controls', async () => {
  const html = await fs.readFile('public/system-explorer.html', 'utf8');
  assert.match(html, /data-preview-mode="original"/);
  assert.match(html, /id="rebuild-btn"/);
  assert.match(html, /data-preview-mode="rebuilt"/);
});
```

- [ ] **Step 2: Add mode controls**

Markup:

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

Only archetype selection enables Build in M02 primary flow.

- [ ] **Step 4: Implement Build action**

POST to:

```js
`/api/results/${encodeURIComponent(domain)}/system/rebuild/archetypes/${encodeURIComponent(archetypeId)}`
```

On success, cache manifest, enable rebuilt preview, render verification status in inspector.

- [ ] **Step 5: Extend preview switching**

Original remains:

```text
/api/results/:domain/system/preview/:pageId
```

Rebuilt becomes:

```text
/api/results/:domain/system/rebuild/archetypes/:archetypeId/preview?page=:pageId
```

Clearly label the center pane `ORIGINAL` or `REBUILT`.

- [ ] **Step 6: Inspector report**

Show:

- verification status;
- generated output path;
- resolved/expected components;
- referenced/resolved assets;
- unresolved dependencies;
- link/button to fidelity JSON.

Do not show a percentage visual fidelity score in M02.

- [ ] **Step 7: Run tests and syntax checks**

Run:

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

### Task 9: CI Gate + Brand Appart Project Detail Certification

**Files:**
- Modify: `.github/workflows/m01-ci.yml` or rename/create a general workflow such as `.github/workflows/verify.yml`
- Create: `docs/m02-brandappart-certification.md`
- Modify: `README.md` only if current project documentation has a usage section appropriate for `npm run rebuild`

**Interfaces:**
- Required CI: syntax, full unit/contracts, server readiness, MCP registry 20 named tools.
- Certification command: `npm run compile -- <brandappart-export-dir>` then `npm run rebuild -- <brandappart-export-dir> <project-detail-archetype-id>`.

- [ ] **Step 1: Generalize CI syntax list**

CI must include at least:

```bash
node --check src/rebuild/rebuild-archetype.mjs
node --check src/rebuild/runtime-builder.mjs
node --check src/rebuild/verifier.mjs
node --check src/rebuild-cli.mjs
```

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`

Expected: all M01 + M02 tests PASS, zero failures.

- [ ] **Step 3: Run real server + MCP smoke**

```bash
npm run dev > /tmp/aspirator-server.log 2>&1 &
SERVER_PID=$!
# wait for http://127.0.0.1:3000/
npm run test:mcp
kill $SERVER_PID
```

Expected: MCP initialize HTTP 200 and 20 required named legacy + M01 + M02 tools present.

- [ ] **Step 4: Run Brand Appart calibration against the real captured export**

Procedure:

```text
1. compile the 40-page export with M01 v1.1;
2. identify the Project Detail archetype by representative/page family;
3. rebuild its representative page;
4. verify all local references;
5. verify expected component ids are resolved or explicitly residual;
6. verify source evidence hashes unchanged;
7. open rebuilt preview through the Aspirator server;
8. generate one additional compatible Project Detail page via shared runtime/data;
9. save fidelity.json and rebuild-manifest.json evidence.
```

- [ ] **Step 5: Record certification facts only**

`docs/m02-brandappart-certification.md` must record actual observed values, for example:

```markdown
- Source pages in Project Detail archetype: <actual>
- Pages rebuilt successfully: <actual>
- Components expected/resolved: <actual>/<actual>
- Assets referenced/resolved: <actual>/<actual>
- Broken local references: <actual>
- Source integrity: PASS/FAIL
- Human preview result: reviewed / needs follow-up
```

Do not pre-fill numbers before running the certification.

- [ ] **Step 6: Open draft PR only after local/core evidence is green**

PR title:

```text
M02 — Reconstruction Compiler
```

PR body must include:

- deterministic scope;
- site-system v1.1 compatibility change;
- generated output contract;
- automated test evidence;
- Brand Appart certification evidence;
- known limitations and dependency-audit status.

- [ ] **Step 7: Wait for GitHub Actions and fix all Critical/Important review findings before Ready**

Do not mark ready or merge while required CI is red.

- [ ] **Step 8: Final commit if documentation/CI changed after certification**

```bash
git add .github docs README.md
 git commit -m "test(m02): certify reconstruction compiler on Brand Appart"
```

---

## Final Acceptance Gate

M02 may be called complete only when all are true:

```text
[ ] site-system v1.1 emitted and v1.0 fallback tested
[ ] component locators deterministic and tested
[ ] Project Detail representative page rebuilt through one public API
[ ] generated output served without source Next/React runtime
[ ] components reference M01 component ids
[ ] local CSS/assets resolve deterministically
[ ] at least two compatible archetype pages share the runtime/data model
[ ] original crawl/system evidence unchanged
[ ] fidelity report passes with zero broken local references
[ ] Explorer switches Original ↔ Rebuilt
[ ] HTTP + MCP + CLI reconstruction access works
[ ] MCP required registry contains 20 named tools
[ ] Brand Appart Project Detail certification recorded with real values
[ ] GitHub Actions PASS on the PR head
```

## Explicitly Deferred

```text
M03 — Identity Transformer / prompt-driven redesign
M04 — React / Next / Web Components / WordPress export
M05 — higher-level agentic reconstruction workflows
M06 — automated screenshot visual-diff scoring
```
