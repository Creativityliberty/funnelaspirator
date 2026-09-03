# M02 Reconstruction Compiler — Design

## Goal

M02 turns the compiled site model introduced in M01 into clean, autonomous, inspectable HTML/CSS/JS output.

The milestone answers one question only:

> Can Funnel Aspirator reconstruct a captured page archetype as clean code while preserving its structure, styling dependencies, assets, and observable behavior closely enough to serve as a trustworthy editable starting point?

M02 is deterministic. It does not redesign the site, rewrite copy with AI, generate React/Next/WordPress, or publish anything.

## Starting point

M01 already produces `exports/{domain}/system/site-system.json` with:

- pages and representative previews;
- archetypes and representative page ids;
- cross-page component registry;
- asset registry;
- design-system tokens;
- per-page motion metadata.

M02 consumes this compiled model. It must not re-run crawling or alter original crawl evidence.

## Primary workflow

```text
site-system.json
      │
      ▼
select archetype
      │
      ├── representative page
      ├── component occurrences
      ├── source HTML
      ├── captured styles/assets
      ├── design tokens
      └── motion metadata
      │
      ▼
RECONSTRUCTION COMPILER
      │
      ├── Source Resolver
      ├── DOM Cleaner
      ├── Component Slicer
      ├── CSS Dependency Compiler
      ├── Asset/Data Binder
      ├── Runtime Builder
      └── Fidelity Verifier
      │
      ▼
exports/{domain}/rebuild/{archetypeId}/
```

The first certification target is the Brand Appart `Project Detail` archetype. Home is the second target after the project-detail family is stable.

## Scope boundary

### M02 includes

- reconstruction by archetype;
- reconstruction of the representative page first;
- clean standalone HTML/CSS/JS output;
- componentized runtime generated from the M01 component registry;
- CSS and asset dependency resolution;
- page data extraction for repeated content;
- local navigation between rebuilt pages when more than one page in the archetype is generated;
- deterministic rebuild manifest;
- structural and resource integrity verification;
- Explorer controls for Build / Original / Rebuilt preview.

### M02 excludes

- AI redesign or copy rewriting;
- visual identity replacement;
- React, Next.js, Vue, Svelte, WordPress or Web Components export targets;
- drag-and-drop editing;
- automated publishing;
- screenshot-driven code generation as the primary reconstruction method;
- claiming pixel-perfect visual fidelity without evidence.

Those belong to later milestones.

## Output contract

For an archetype `arch-project-detail`, M02 writes:

```text
exports/{domain}/rebuild/arch-project-detail/
├── rebuild-manifest.json
├── index.html
├── app.js
├── styles/
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   └── components.css
├── components/
│   ├── registry.js
│   └── *.js
├── data/
│   ├── archetype.json
│   └── pages/
│       └── *.json
├── assets/
│   └── ...
└── reports/
    └── fidelity.json
```

The original `exports/{domain}/pages`, `data`, `assets`, `screenshots`, and `system` directories remain unchanged.

## Rebuild manifest

`rebuild-manifest.json` is the canonical description of the generated output.

```json
{
  "version": "1.0",
  "domain": "www.brandappart.com",
  "archetypeId": "arch-project-detail",
  "representativePageId": "page-project-example",
  "target": "vanilla",
  "generatedFiles": [],
  "componentIds": [],
  "assetIds": [],
  "pageIds": [],
  "verification": {
    "status": "pass",
    "brokenResources": 0,
    "missingComponents": 0
  }
}
```

Generated ids must reference M01 ids wherever possible rather than inventing parallel identity systems.

## Reconstruction units

### 1. Source Resolver

Resolves all source material required by the selected archetype:

- representative page HTML;
- M01 page metadata;
- component occurrences on that page;
- CSS files referenced by the source page;
- captured same-domain assets;
- design-system tokens;
- relevant motion data.

Every resolved filesystem path must remain inside `exports/{domain}`.

Failure to resolve optional motion data is non-fatal. Failure to resolve the representative source HTML is fatal.

### 2. DOM Cleaner

Produces a reconstruction DOM without mutating the source page.

It removes or normalizes:

- analytics and tracking scripts;
- framework hydration payloads that are unnecessary for the rebuilt runtime;
- duplicate preload hints;
- captured development/runtime markers;
- unsafe external navigation behavior;
- attributes that only serve the source framework runtime.

It preserves by default:

- semantic elements;
- accessibility attributes;
- classes and ids needed by extracted CSS;
- inline SVG;
- forms as inert/local unless explicitly supported;
- data attributes if referenced by CSS or retained interaction code.

The cleaner is conservative: unknown attributes are preserved unless a rule proves they are framework-only or unsafe.

### 3. Component Slicer

Uses the M01 component registry plus the representative DOM to create reconstruction component boundaries.

A component is generated only when Aspirator can locate its occurrence reliably in the source DOM.

Each generated component record contains:

- M01 component id;
- semantic role;
- source selector/signature;
- extracted markup;
- variant id where known;
- required asset ids;
- required style dependencies;
- page usage metadata.

M02 does not force every DOM node into a component. Unclassified residual markup remains in the page shell rather than being guessed into a fake component hierarchy.

### 4. CSS Dependency Compiler

The CSS compiler aims for minimum safe CSS, not theoretical perfect tree-shaking.

Priority order:

1. collect all stylesheets used by the representative page;
2. preserve CSS variables, font declarations, keyframes and global reset/base rules;
3. retain rules matching generated component markup and page-shell markup;
4. include referenced pseudo states, media queries and keyframes;
5. rewrite `url(...)` resources to rebuilt local asset paths;
6. deduplicate identical rules where safe;
7. write deterministic output order.

If exact dependency pruning cannot be proven safe, the compiler keeps the relevant captured stylesheet rather than dropping a potentially required rule.

No font files are generated or redistributed by the compiler. Existing captured font references may be represented in metadata, but runtime packaging must respect source availability/licensing and may fall back when the asset is not locally available.

### 5. Asset and Data Binder

Assets are copied only when referenced by the rebuilt archetype or its generated page data.

The binder:

- maps M01 asset ids/paths to rebuild-local paths;
- rewrites image, video, SVG, CSS and source-set references;
- preserves external embeds only when explicitly allowed;
- records unresolved resources in `fidelity.json`;
- never fetches new network assets during deterministic reconstruction.

Content that differs across pages of one archetype is moved into page data when it can be identified safely, for example:

- headings and body copy;
- image/video references;
- project metadata;
- CTA labels/links;
- gallery items.

If extraction is ambiguous, the representative page keeps literal markup rather than inventing a data model.

### 6. Vanilla Runtime Builder

M02 generates an ES-module browser runtime with no build step required.

The runtime responsibilities are limited to:

- composing generated components;
- binding selected page data;
- restoring supported interactions;
- local route/page selection for generated archetype members;
- sending preview navigation events back to Aspirator Explorer when embedded.

The runtime must work when served by the existing Aspirator Express server. Direct `file://` execution is not a certification requirement because ES modules and browser security rules make it unreliable across browsers.

### 7. Fidelity Verifier

M02 verification distinguishes what can be proven structurally from visual similarity.

Required deterministic checks:

- generated entry file exists;
- all local HTML/CSS/JS references resolve;
- all referenced copied assets exist;
- expected M01 components are represented or explicitly marked residual/unresolved;
- no generated path escapes the rebuild root;
- no source crawl artifact changed;
- rebuilt document parses successfully;
- no prohibited tracking scripts remain;
- internal rebuilt navigation resolves.

The report contains:

```json
{
  "status": "pass",
  "checks": {
    "document": "pass",
    "resources": "pass",
    "components": "pass",
    "navigation": "pass",
    "sourceIntegrity": "pass"
  },
  "metrics": {
    "componentsExpected": 8,
    "componentsResolved": 8,
    "assetsReferenced": 96,
    "assetsResolved": 96,
    "brokenLinks": 0
  },
  "visual": {
    "status": "not-scored"
  }
}
```

M02 may capture original and rebuilt screenshots for human comparison, but automated pixel/visual scoring is reserved for M06 unless a small prerequisite metric is required to debug M02.

## Archetype-first behavior

M02 reconstructs the representative page first, then applies the resulting structure to other pages in the same archetype only when their component sequence is compatible.

A page may be excluded from batch generation when:

- its structural signature diverges beyond the archetype tolerance;
- a required component occurrence cannot be located;
- essential source HTML/assets are missing.

Exclusion is reported, not silently coerced.

This prevents one anomalous page from corrupting the reusable archetype runtime.

## Explorer integration

The existing M01 Explorer gains a reconstruction mode without replacing original preview.

For an archetype or page the UI exposes:

```text
[ Original Preview ]  [ Build ]  [ Rebuilt Preview ]
```

The inspector shows:

- reconstruction status;
- generated output path;
- resolved component count;
- referenced/resolved asset count;
- unresolved dependencies;
- fidelity report link;
- rebuild timestamp/version.

Original preview remains the evidence view. Rebuilt preview is always visually distinguished as generated output.

## HTTP surface

M02 extends the existing `/api/results/:domain/system/...` namespace rather than creating conflicting legacy routes.

Proposed endpoints:

```text
POST /api/results/:domain/system/rebuild/archetypes/:archetypeId
GET  /api/results/:domain/system/rebuild/archetypes/:archetypeId
GET  /api/results/:domain/system/rebuild/archetypes/:archetypeId/preview
GET  /api/results/:domain/system/rebuild/archetypes/:archetypeId/report
```

A later bounded extension may add page-specific reconstruction if needed, but the M02 primary contract is archetype reconstruction.

## MCP surface

M02 adds only the tools required for deterministic reconstruction:

```text
rebuild_archetype
get_rebuild_manifest
get_rebuild_report
```

No prompt-driven redesign or arbitrary code-generation tool is part of M02.

## Error handling

Errors are classified as:

- `SOURCE_MISSING` — required crawl/system evidence unavailable;
- `INVALID_ARCHETYPE` — unknown or unusable archetype id;
- `COMPONENT_UNRESOLVED` — expected component cannot be located;
- `ASSET_UNRESOLVED` — required asset cannot be mapped locally;
- `CSS_UNRESOLVED` — required stylesheet/dependency cannot be resolved;
- `OUTPUT_ESCAPE` — attempted path traversal outside rebuild root;
- `VERIFY_FAILED` — generated output exists but fails integrity checks.

Compilation writes to a staging directory and publishes the rebuild directory only after required generation steps complete. A failed run must not destroy the last known-good rebuild.

## Security and isolation

- All source and output paths are constrained to the domain export root.
- Rebuilt preview uses the existing sandbox strategy.
- Tracking/analytics are stripped from rebuilt output.
- External scripts are disabled by default unless explicitly allowlisted for a supported reconstruction case.
- Forms do not submit to captured production endpoints by default.
- Reconstruction never executes captured Node/server code.
- Reconstruction never writes into source crawl directories.

## Determinism

For identical source artifacts, M01 manifest, compiler version and options, M02 must generate the same logical output and stable manifests.

Timestamps may exist in run metadata but must not participate in content identities or component/file naming.

## Testing strategy

### Fast synthetic fixture

Extend the existing mini-site fixture with:

- one reusable project-detail archetype;
- shared header/footer;
- project hero;
- gallery;
- CSS variables/media queries/keyframes;
- image references and one intentionally external resource.

Unit/contract tests cover each reconstruction unit independently.

### Brand Appart certification fixture

Use the real captured Brand Appart export as a long-running/manual or optional integration fixture, not as the default lightweight CI payload.

Certification checks:

1. identify the Project Detail archetype;
2. rebuild its representative page;
3. generate clean local HTML/CSS/JS output;
4. resolve all required locally captured resources or report exact misses;
5. generate expected component boundaries from M01 identities;
6. preserve original source artifacts byte-for-byte;
7. open rebuilt preview through Aspirator;
8. generate at least one additional compatible Project Detail page from page data/structure reuse;
9. produce a passing deterministic fidelity report before claiming the archetype rebuild successful.

Home becomes certification case two after Project Detail passes.

## Acceptance criteria

M02 is complete when:

- an M01 archetype can be selected by id and rebuilt through one public compiler API;
- the output is autonomous HTML/CSS/JS served by Aspirator without the source framework runtime;
- component boundaries reference M01 component identities;
- local assets and CSS dependencies are resolved deterministically;
- at least two compatible pages in one archetype can share the same generated runtime with page-specific data where safely extractable;
- original crawl/system artifacts are unchanged;
- integrity verification passes with no broken local references;
- the Explorer can switch between Original and Rebuilt previews;
- HTTP and MCP expose the reconstruction result;
- Brand Appart Project Detail passes the M02 certification procedure.

## Non-goals after acceptance

A passing M02 rebuild is not automatically a pixel-perfect clone, a legally redistributable asset package, a redesign, or a production deployment. It is a structurally faithful, dependency-resolved, editable reconstruction baseline.

M03 may transform identity and content. M04 may add other export targets. M06 may add automated visual-diff scoring.