# M01 Site System Compiler & Explorer Design

Funnel Aspirator keeps the current Playwright crawler and Express/MCP surface. A new compiler layer reads existing crawl artifacts and emits a normalized site-system manifest. The compiler is pure where possible, so page signatures, archetype clustering, component registry generation, asset indexing, and preview normalization can be tested independently.

The output contract lives under `exports/{domain}/system/` and contains `site-system.json`, `pages.json`, `archetypes.json`, `components.json`, `assets.json`, plus normalized preview documents. Existing crawl artifacts remain untouched.

The Studio gains a three-pane explorer: tree navigation on the left, sandboxed live preview in the center, and an inspector on the right. Pages, archetypes, components, assets, and motion are all navigable from the same compiled manifest. HTTP and MCP expose the same compiled model.
