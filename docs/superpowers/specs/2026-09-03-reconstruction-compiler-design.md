# M02 Reconstruction Compiler — Design

## Goal

M02 turns the M01 compiled site model into clean, autonomous, inspectable HTML/CSS/JS output.

It answers one question only:

> Can Funnel Aspirator reconstruct a captured page archetype as editable code while preserving its structure, styling dependencies, assets, and observable behavior closely enough to serve as a trustworthy reconstruction baseline?

M02 is deterministic. It does not redesign the site, rewrite copy with AI, generate React/Next/WordPress, or publish anything.

## Starting point

M01 already produces `exports/{domain}/system/site-system.json` containing pages, archetypes, component families, assets, design tokens, motion metadata and normalized original previews.

M02 consumes those artifacts and the original captured HTML/CSS/assets. It never re-runs crawling and never mutates original crawl evidence.

## M01 compatibility prerequisites

Self-review of the current M01 model found two metadata gaps that M02 must close before slicing components reliably:

1. public page records expose `html` and `screenshot` but not the source `data/*.json` path;
2. component occurrences expose role/tag/classes/index but not a stable DOM locator.

M02 therefore introduces a backward-compatible site-system schema extension:

```json
{
  "version": "1.1",
  "pages": [
    {
      "id": "page-001",
      "html": "pages/index.html",
      "data": "data/index.json"
    }
  ],
  "components": [
    {
      "id": "cmp-project-hero",
      "occurrences": [
        {
          "pageId": "page-001",
          "locator": {
            "strategy": "id|selector-ordinal|structural",
            "selector": "#project-hero",
            "ordinal": 0,
            "fingerprint": "stable-hash"
          }
        }
      ]
    }
  ]
}
```

Locator priority is deterministic:

1. unique source id;
2. stable tag + normalized classes + ordinal among matching siblings;
3. structural fingerprint fallback.

`compileSiteSystem()` may emit v1.1 after M02 is introduced. The reconstruction compiler must still accept M01 v1.0 manifests by deriving missing `data` and locator metadata from original crawl artifacts when possible. No existing M01 HTTP/MCP contract is removed.

## Primary workflow

```text
site-system.json
      │
      ▼
select archetype
      │
      ├── representative page
      ├── component occurrences + locators
      ├── source HTML + page data
      ├── captured CSS/assets
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
      ├── Vanilla Runtime Builder
      └── Fidelity Verifier
      │
      ▼
exports/{domain}/rebuild/{archetypeId}/
```

The first certification target is Brand Appart `Project Detail`. Home is the second target after that family is stable.

## Scope

### Included

- reconstruction by archetype;
- representative-page reconstruction first;
- standalone HTML/CSS/JS served by Aspirator with no source framework runtime;
- generated component boundaries tied to M01 component ids;
- CSS and local asset dependency resolution;
- safe extraction of page-specific content into data;
- reuse of one archetype runtime by compatible pages;
- deterministic rebuild manifest;
- structural/resource integrity report;
- Explorer controls for Original / Build / Rebuilt;
- HTTP and MCP reconstruction access.

### Excluded

- AI redesign or copy rewriting;
- identity replacement;
- React, Next.js, Vue, Svelte, WordPress or Web Components targets;
- drag-and-drop editing;
- automated publishing;
- screenshot-to-code as the primary reconstruction mechanism;
- claiming pixel-perfect fidelity without measured evidence.

## Output contract

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
│   ├── registry.js
│   └── *.js
├── data/
│   ├── archetype.json
│   └── pages/*.json
├── assets/
└── reports/
    └── fidelity.json
```

Original `pages/`, `data/`, `assets/`, `screenshots/` and `system/` remain untouched.

`rebuild-manifest.json` is canonical:

```json
{
  "version": "1.0",
  "domain": "www.brandappart.com",
  "archetypeId": "arch-project-detail",
  "representativePageId": "page-001",
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

Generated identities reuse M01 ids wherever possible.

## Reconstruction units

### 1. Source Resolver

Resolves representative HTML, page data, component occurrences, stylesheets, local assets, tokens and relevant motion.

All filesystem paths must remain inside `exports/{domain}`. Missing optional motion is non-fatal. Missing representative HTML is fatal.

### 2. DOM Cleaner

Builds a reconstruction DOM without modifying source HTML.

It removes or normalizes tracking, analytics, unnecessary hydration payloads, duplicate preload hints, framework-only runtime markers and unsafe captured navigation behavior.

It preserves semantic elements, accessibility attributes, style-relevant classes/ids, inline SVG, CSS-referenced data attributes and unknown attributes unless a rule proves they are unsafe or framework-only.

Forms are inert/local by default and never submit to captured production endpoints.

### 3. Component Slicer

Locates representative-page occurrences using M01 locators and extracts markup for reusable reconstruction units.

Each generated component record carries:

- M01 component id;
- semantic role;
- source locator/fingerprint;
- variant id when known;
- extracted markup;
- required assets/styles;
- page usage metadata.

If a component cannot be located confidently, it is reported as unresolved or left as residual page-shell markup. M02 never invents a component boundary merely to satisfy a target count.

### 4. CSS Dependency Compiler

The CSS compiler optimizes for minimum safe CSS, not aggressive tree-shaking.

It:

1. gathers stylesheets used by the representative page;
2. preserves variables, reset/base rules, font declarations, media queries and keyframes;
3. retains rules matching generated components or residual shell markup;
4. retains referenced pseudo states and animation dependencies;
5. rewrites `url(...)` references to rebuild-local assets;
6. deduplicates only when safe;
7. writes deterministic output order.

When pruning safety cannot be proven, it keeps the relevant captured stylesheet rather than risk visual breakage.

M02 does not generate or redistribute font binaries. Font references may be retained in metadata/style output only when available and appropriate; otherwise the rebuild reports the missing dependency or falls back.

### 5. Asset/Data Binder

Copies only locally captured assets referenced by the rebuilt archetype/runtime.

It rewrites image/video/SVG/CSS/source-set references, records unresolved resources, and never fetches new network assets during deterministic reconstruction.

Content differences across compatible archetype pages may be moved into page JSON when safely identifiable: headings, copy, media references, project metadata, CTA labels/links and gallery items.

Ambiguous content remains literal markup rather than forcing a guessed schema.

### 6. Vanilla Runtime Builder

Generates ES modules requiring no build step.

Responsibilities are limited to component composition, page-data binding, supported interactions, local selection/navigation among generated archetype pages, and Explorer preview messaging.

Certification requires serving through Aspirator Express. `file://` execution is not required because browser module/security behavior varies.

### 7. Fidelity Verifier

M02 proves structural/resource integrity separately from visual similarity.

Required checks:

- entry files exist and parse;
- all local HTML/CSS/JS references resolve;
- referenced copied assets exist;
- expected M01 components are resolved or explicitly residual/unresolved;
- generated paths stay inside rebuild root;
- original crawl/system evidence is unchanged;
- prohibited tracking is absent;
- rebuilt internal navigation resolves.

Example report:

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

M02 may capture original/rebuilt screenshots for human inspection. Automated visual scoring remains M06 unless a minimal diagnostic metric becomes necessary to debug reconstruction.

## Archetype-first behavior

M02 reconstructs the representative page first, then reuses that runtime for other pages only when their component sequence and required dependencies are compatible.

A page is excluded from batch generation when structure diverges materially, a required component cannot be located, or essential source evidence is missing. Exclusion is explicit in the report; Aspirator never silently coerces an anomalous page into the template.

## Explorer integration

The M01 Explorer gains:

```text
[ Original Preview ]  [ Build ]  [ Rebuilt Preview ]
```

Inspector fields include build status, output path, resolved component count, referenced/resolved assets, unresolved dependencies, fidelity report and rebuild version.

Original Preview remains evidence. Rebuilt Preview is always labelled as generated output.

## HTTP surface

M02 stays inside the existing M01 namespace:

```text
POST /api/results/:domain/system/rebuild/archetypes/:archetypeId
GET  /api/results/:domain/system/rebuild/archetypes/:archetypeId
GET  /api/results/:domain/system/rebuild/archetypes/:archetypeId/preview
GET  /api/results/:domain/system/rebuild/archetypes/:archetypeId/report
```

Page-specific reconstruction is not a primary M02 contract; it may be added later as a bounded extension if required.

## MCP surface

Only deterministic tools are added:

```text
rebuild_archetype
get_rebuild_manifest
get_rebuild_report
```

No arbitrary prompt-driven code generation is part of M02.

## Error model

- `SOURCE_MISSING`
- `INVALID_ARCHETYPE`
- `COMPONENT_UNRESOLVED`
- `ASSET_UNRESOLVED`
- `CSS_UNRESOLVED`
- `OUTPUT_ESCAPE`
- `VERIFY_FAILED`

Generation writes to a staging directory and atomically replaces the published rebuild only after required generation succeeds. A failed run cannot destroy the last known-good rebuild.

## Security and isolation

- source/output paths constrained to domain export root;
- rebuilt preview sandboxed;
- analytics/tracking removed;
- external scripts disabled unless explicitly allowlisted;
- captured forms cannot submit to production by default;
- captured server/Node code is never executed;
- source crawl directories are read-only from M02’s perspective.

## Determinism

Identical source artifacts + site-system version + compiler version + options must produce the same logical output and stable identities. Timestamps may exist only as run metadata and never affect content naming/hashes.

## Testing strategy

### Fast fixture

Extend the mini-site with one reusable project-detail archetype, shared header/footer, project hero, gallery, CSS variables, media queries, keyframes, local images and one intentionally external resource.

Each reconstruction unit receives focused tests.

### Brand Appart certification

The real 40-page export remains an optional/manual long-running fixture, not the normal CI payload.

Certification requires:

1. locate Project Detail archetype;
2. rebuild representative page;
3. generate framework-independent local HTML/CSS/JS;
4. resolve all required captured resources or report exact misses;
5. preserve M01 component identities;
6. preserve original evidence byte-for-byte;
7. open rebuilt preview through Explorer;
8. generate at least one additional compatible Project Detail page using the shared runtime;
9. produce a passing deterministic integrity report.

Home becomes certification case two.

## Acceptance criteria

M02 is complete when:

- one public compiler API rebuilds an M01 archetype by id;
- output runs through Aspirator without the source framework runtime;
- component boundaries reference M01 identities and stable locators;
- local CSS/assets resolve deterministically;
- at least two compatible pages share one archetype runtime with page-specific data where safely extractable;
- original evidence remains unchanged;
- integrity verification reports no broken local references;
- Explorer switches between Original and Rebuilt;
- HTTP and MCP expose reconstruction state/results;
- Brand Appart Project Detail passes the certification procedure.

A passing M02 result is a structurally faithful, dependency-resolved reconstruction baseline. It is not automatically pixel-perfect, legally redistributable, redesigned, or production-deployed.

M03 handles identity/content transformation. M04 adds other export targets. M06 adds automated visual-diff scoring.