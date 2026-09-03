import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { assertInsideRoot } from '../compiler/schema.mjs';
import { RebuildError, REBUILD_CODES } from './errors.mjs';
import { resolveRebuildPaths } from './paths.mjs';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function inside(root, relativePath, code = REBUILD_CODES.SOURCE_MISSING) {
  try {
    return assertInsideRoot(root, path.join(root, relativePath));
  } catch (error) {
    throw new RebuildError(code, error.message, { relativePath });
  }
}

function legacyDataPath(page) {
  if (!page?.html) return null;
  const base = path.basename(page.html, path.extname(page.html));
  return path.posix.join('data', `${base}.json`);
}

function extractRefs(html) {
  const $ = cheerio.load(html || '');
  const styleRefs = [];
  const assetRefs = [];
  const seenStyles = new Set();
  const seenAssets = new Set();

  $('link[rel="stylesheet"][href], link[rel~="stylesheet"][href]').each((_i, element) => {
    const href = $(element).attr('href');
    if (href && !seenStyles.has(href)) {
      seenStyles.add(href);
      styleRefs.push(href);
    }
  });

  $('[src], [poster]').each((_i, element) => {
    for (const attr of ['src', 'poster']) {
      const value = $(element).attr(attr);
      if (value && !seenAssets.has(value)) {
        seenAssets.add(value);
        assetRefs.push(value);
      }
    }
  });

  $('[srcset]').each((_i, element) => {
    const srcset = $(element).attr('srcset') || '';
    for (const candidate of srcset.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean)) {
      if (!seenAssets.has(candidate)) {
        seenAssets.add(candidate);
        assetRefs.push(candidate);
      }
    }
  });

  return { styleRefs, assetRefs };
}

function representativeOccurrences(system, pageId) {
  const occurrences = [];
  for (const component of system.components || []) {
    for (const occurrence of component.occurrences || []) {
      if (occurrence.pageId !== pageId) continue;
      occurrences.push({
        ...occurrence,
        componentId: component.id,
        componentLabel: component.label,
        componentKind: component.kind,
      });
    }
  }
  return occurrences.sort((a, b) => (a.index || 0) - (b.index || 0));
}

export async function resolveArchetypeSource({ domainDir, archetypeId } = {}) {
  if (!domainDir) {
    throw new RebuildError(REBUILD_CODES.SOURCE_MISSING, 'domainDir is required');
  }

  const root = path.resolve(domainDir);
  const rebuildPaths = resolveRebuildPaths(root, archetypeId);
  const systemPath = inside(root, path.join('system', 'site-system.json'));

  let system;
  try {
    system = await readJson(systemPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new RebuildError(REBUILD_CODES.SOURCE_MISSING, 'Compiled site system not found');
    }
    throw error;
  }

  const archetype = (system.archetypes || []).find((item) => item.id === archetypeId);
  if (!archetype) {
    throw new RebuildError(REBUILD_CODES.INVALID_ARCHETYPE, `Archetype not found: ${archetypeId}`);
  }

  const representativePage = (system.pages || []).find(
    (page) => page.id === archetype.representativePageId,
  );
  if (!representativePage?.html) {
    throw new RebuildError(
      REBUILD_CODES.SOURCE_MISSING,
      `Representative source HTML missing for ${archetype.id}`,
    );
  }

  const sourceHtmlPath = inside(root, representativePage.html);
  let sourceHtml;
  try {
    sourceHtml = await fs.readFile(sourceHtmlPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new RebuildError(REBUILD_CODES.SOURCE_MISSING, `Source HTML not found: ${representativePage.html}`);
    }
    throw error;
  }

  let sourceDataPath = typeof representativePage.data === 'string'
    ? representativePage.data
    : null;
  let sourceData = {};
  if (sourceDataPath) {
    sourceData = await readJsonIfExists(inside(root, sourceDataPath)) || {};
  } else {
    const fallback = legacyDataPath(representativePage);
    if (fallback) {
      const candidate = inside(root, fallback);
      const data = await readJsonIfExists(candidate);
      if (data) {
        sourceDataPath = fallback;
        sourceData = data;
      }
    }
  }

  const { styleRefs, assetRefs } = extractRefs(sourceHtml);

  return {
    system,
    archetype,
    representativePage,
    sourceHtml,
    sourceHtmlPath: representativePage.html,
    sourceData,
    sourceDataPath,
    componentOccurrences: representativeOccurrences(system, representativePage.id),
    styleRefs,
    assetRefs,
    rebuildPaths,
  };
}
