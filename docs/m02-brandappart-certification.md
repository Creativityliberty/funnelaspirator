# M02 — Brand Appart Reconstruction Certification

Date: 2026-09-03  
Branch: `feat/m02-reconstruction-compiler`  
Certified implementation SHA: `efce417e891f2394d77c11b1adddfe94f84de8a4`

## Verdict

**PASS — M02 Reconstruction Compiler is certified on the Brand Appart export for the tested Project Detail archetype.**

The certification covers the real chain:

`Brand Appart export → M01 compile → archetype selection → M02 rebuild → verifier → HTTP preview`

No visual-fidelity percentage is claimed. Structural/runtime integrity is certified; visual scoring remains `not-scored`.

## Source fixture

- Source: captured Brand Appart export supplied as the M02 torture-test fixture.
- Files in extracted source fixture: **730**.
- Compiled pages: **40**.
- Compiled archetypes: **14**.
- Compiled components: **46**.
- Compiled assets: **609**.
- Font binaries present in the supplied export: **0**.

## Certified archetype

- Archetype: `arch-project-detail-2`.
- Label: Project Detail.
- Representative page: `page-024`.
- Compatible runtime pages accepted by the deterministic data gate: **2** — `page-024`, `page-026`.
- Divergent pages excluded instead of being forced into an incompatible runtime: **8** — `page-030`, `page-031`, `page-032`, `page-033`, `page-036`, `page-037`, `page-039`, `page-040`.
- Reconstructed component IDs: **10**.
- Components resolved: **10 / 10**.

## Verification report

`reports/fidelity.json` returned `status: pass` with:

- `document`: PASS
- `resources`: PASS
- `virtualAssets`: PASS
- `components`: PASS
- `navigation`: PASS
- `sourceIntegrity`: PASS
- `tracking`: PASS
- `outputIsolation`: PASS
- broken local resources: **0**
- virtual Next image optimizer references: **0**
- missing components: **0**
- source mismatches: **0**
- font references recorded: **38**
- missing font references: **38** — non-blocking because the supplied capture contains no corresponding font binaries

## Independent post-build checks

The published rebuild was scanned independently of the internal verifier.

- Known tracking signatures across generated HTML/CSS/JS/JSON: **0**.
- `/_next/image?` references across generated HTML/CSS/JS/JSON: **0**.
- Runtime text files checked: **11**.
- Unique generated `assets/*` files referenced by the runtime: **31**.
- Missing referenced generated assets: **0**.

This independent scan specifically validates the final defense-in-depth fixes for:

1. tracking data surviving in serialized page data;
2. tracking captures surviving as copied source assets;
3. virtual Next image optimizer `srcset` values surviving inside sliced component fragments;
4. framework/tracking markup surviving fallback component slicing.

## HTTP preview checks

The exact GitHub Actions certification runner was started against the certified rebuild.

Observed responses:

- rebuild preview endpoint: **HTTP 200**
- injected rebuild `<base>`: `/exports/brandappart-final/rebuild/arch-project-detail-2/`
- `styles/tokens.css`: **HTTP 200**
- `styles/components.css`: **HTTP 200**
- `app.js`: **HTTP 200**

The `<base>` injection is required because the preview API route and static rebuild directory live under different URL paths.

## Test and CI evidence

GitHub Actions workflow: **Aspirator Verification**  
Run: **#62**  
Run ID: `33788097552`  
Conclusion: **SUCCESS**

The workflow passed:

- dependency install
- syntax checks
- unit and contract tests
- real server smoke test
- MCP smoke test

The exact certification runner from that successful workflow was used for the Brand Appart rebuild described above.

A local re-run from that exact runner produced:

- tests: **66**
- pass: **66**
- fail: **0**

## Known non-blocking limitations

### Fonts

The source export references proprietary/site fonts, but the supplied export contains no `.woff`, `.woff2`, `.ttf`, or `.otf` binaries. M02 therefore preserves the references as diagnostics and does not invent or fabricate missing font files.

### External media

External Vimeo embeds are recorded as external dependencies and are not fetched or copied by the asset binder. The reconstruction remains deterministic for captured local assets.

### Visual scoring

Automated pixel-difference scoring is intentionally not part of this certification. The current sandbox browser policy prevented a trustworthy end-to-end Chromium screenshot comparison, so the report correctly remains `visual.status = not-scored` rather than inventing a fidelity percentage.

## M02 acceptance decision

M02 is accepted for the certified scope because it now demonstrates all required behavior on a real, complex export:

- source evidence remains immutable;
- a reusable archetype runtime is generated;
- compatible pages share one runtime and page data;
- structurally divergent pages are excluded explicitly;
- components are resolved from the compiled M01 system;
- local assets are rebound without network fetching;
- tracking/framework payloads are removed from DOM, assets, and runtime data;
- virtual Next image optimizer references are removed from shell and component fragments;
- missing proprietary fonts are reported without being fabricated;
- verification blocks publication on structural/runtime failures;
- the HTTP preview serves the published rebuild with working relative resources.

**Certification status: PASS.**
