import fs from 'fs/promises';
import path from 'path';
import { loadSiteExport } from './load-export.mjs';
import { buildPageSignature } from './page-signature.mjs';
import { clusterPages } from './archetypes.mjs';
import { buildComponentRegistry } from './components.mjs';
import { buildAssetRegistry } from './assets.mjs';
import { buildPreviewAssetMap } from './asset-map.mjs';
import { normalizePreviewHtml } from './preview-normalizer.mjs';
import { SITE_SYSTEM_VERSION, assertInsideRoot } from './schema.mjs';

function firstObject(values) {
  return values.find(
    (value) => value && typeof value === 'object' && Object.keys(value).length > 0,
  ) || {};
}

function stableGeneratedAt(loaded) {
  for (const page of loaded.pages) {
    const candidate = page.source?.capturedAt
      || page.source?.date
      || page.data?.capturedAt
      || page.data?.date;
    if (candidate) return candidate;
  }
  return null;
}

function publicPage(page, archetypes, components) {
  const archetype = archetypes.find((item) => item.pageIds.includes(page.id));
  const componentIds = components
    .filter((item) => item.pageIds.includes(page.id))
    .map((item) => item.id);

  return {
    id: page.id,
    route: page.route,
    url: page.url,
    title: page.title,
    html: page.html,
    data: page.dataPath || null,
    screenshot: page.screenshot,
    preview: page.html ? `system/preview/${page.id}.html` : null,
    archetypeId: archetype?.id || null,
    sectionSequence: page.signature.sectionSequence,
    componentIds,
    assetIds: [],
    signature: page.signature.structureHash,
  };
}

async function writeJson(target, value) {
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writePreviews({ root, domain, pages, assetMap }) {
  const previewDir = assertInsideRoot(root, path.join(root, 'system', 'preview'));
  await fs.mkdir(previewDir, { recursive: true });
  const baseHref = `/exports/${encodeURIComponent(domain)}/pages/`;

  for (const page of pages) {
    if (!page.html) continue;
    const sourcePath = assertInsideRoot(root, path.join(root, page.html));
    let html;
    try {
      html = await fs.readFile(sourcePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    const normalized = normalizePreviewHtml({ html, domain, baseHref, assetMap });
    await fs.writeFile(path.join(previewDir, `${page.id}.html`), normalized, 'utf8');
  }
}

export async function compileSiteSystem({ exportDir, write = true } = {}) {
  if (!exportDir) throw new Error('exportDir is required');

  const loaded = await loadSiteExport(exportDir);
  const pagesWithSignatures = loaded.pages.map((page) => ({
    ...page,
    signature: buildPageSignature(page),
  }));
  const archetypes = clusterPages(pagesWithSignatures);
  const components = buildComponentRegistry(pagesWithSignatures);
  const assets = await buildAssetRegistry(loaded.root);
  const assetMap = buildPreviewAssetMap(pagesWithSignatures, loaded.domain);
  const pages = pagesWithSignatures.map((page) => publicPage(page, archetypes, components));

  const designSystem = Object.keys(loaded.designSystem || {}).length
    ? loaded.designSystem
    : firstObject(pagesWithSignatures.map((page) => page.designTokens));

  const motion = {
    pages: pagesWithSignatures
      .filter((page) => page.motion && Object.keys(page.motion).length > 0)
      .map((page) => ({ pageId: page.id, route: page.route, motion: page.motion })),
  };

  const system = {
    version: SITE_SYSTEM_VERSION,
    domain: loaded.domain,
    stats: {
      pages: pages.length,
      archetypes: archetypes.length,
      components: components.length,
      assets: assets.length,
    },
    pages,
    archetypes,
    components,
    assets,
    designSystem,
    motion,
    generatedAt: stableGeneratedAt(loaded),
  };

  if (write) {
    const systemDir = assertInsideRoot(loaded.root, path.join(loaded.root, 'system'));
    await fs.mkdir(systemDir, { recursive: true });
    await writePreviews({
      root: loaded.root,
      domain: loaded.domain,
      pages: pagesWithSignatures,
      assetMap,
    });
    await Promise.all([
      writeJson(path.join(systemDir, 'site-system.json'), system),
      writeJson(path.join(systemDir, 'pages.json'), pages),
      writeJson(path.join(systemDir, 'archetypes.json'), archetypes),
      writeJson(path.join(systemDir, 'components.json'), components),
      writeJson(path.join(systemDir, 'assets.json'), assets),
    ]);
  }

  return system;
}
