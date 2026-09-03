# Funnel Aspirator — M01 Site System Compiler & Explorer

**Goal:** Transformer Funnel Aspirator d’un crawler/analyseur de pages en compilateur de systèmes de sites capable de regrouper les pages en archétypes, détecter les composants récurrents et prévisualiser pages/composants localement.

**Architecture:** conserver `src/crawl.mjs` pour l’acquisition Playwright et `src/server.mjs` pour HTTP/MCP. Ajouter `src/compiler/` comme couche pure et testable consommant les exports existants (`sitemap.json`, `data/*.json`, HTML, screenshots, assets) et produisant `system/site-system.json`. Le Studio consomme ce manifeste.

**Tech Stack:** Node.js >=18, ES modules, Express 5, Playwright, Cheerio, Zod, frontend Vanilla HTML/CSS/JS.

## Global Constraints
- Ne pas casser `/api/crawl`, `/api/results`, `/api/download`, `/sse`, `/messages`.
- Aucun framework frontend supplémentaire dans M01.
- Sorties déterministes pour un export identique.
- Les chemins de preview doivent rester dans `exports/{domain}`.
- Brand Appart sert de fixture de validation longue.
- M01 = Capture → Analyze → Compile → Explore → Preview.
- Reconstruction/export multi-target restent hors M01.

## Tasks
1. Export Loader + Schema (`loadSiteExport`).
2. Page Signature Engine (`buildPageSignature`).
3. Archetype Engine (`clusterPages`).
4. Component Registry (`buildComponentRegistry`).
5. Asset Registry + Preview Normalizer (`normalizePreviewHtml`).
6. Site Compiler (`compileSiteSystem`).
7. HTTP + MCP APIs pour system/pages/archetypes/components/preview.
8. Studio Explorer 3 colonnes avec Pages / Archetypes / Components / Assets / Motion et viewports 1440/1024/768/390.

## Verification
- `node --test test/**/*.test.mjs`
- Regression manuelle des vues Crawler, Studio, Extractor.
- Validation Brand Appart: toutes les pages addressables, archetypes calculés, composants multi-pages, preview locale sans dépendance Next Image optimizer, artefacts originaux inchangés.
