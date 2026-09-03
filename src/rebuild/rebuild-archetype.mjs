import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { assertInsideRoot } from '../compiler/schema.mjs';
import { resolveArchetypeSource } from './source-resolver.mjs';
import { cleanRebuildDocument, cleanRebuildFragment } from './dom-cleaner.mjs';
import { sliceComponents } from './component-slicer.mjs';
import { compileStyles } from './css-compiler.mjs';
import { bindAssets } from './asset-binder.mjs';
import { extractArchetypeData } from './data-extractor.mjs';
import { buildVanillaRuntime } from './runtime-builder.mjs';
import { verifyRebuild } from './verifier.mjs';
import { RebuildError, REBUILD_CODES } from './errors.mjs';

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

async function readTextIfExists(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function hashEvidence(domainDir, system, archetype) {
  const paths = new Set(['system/site-system.json']);
  for (const pageId of archetype.pageIds || []) {
    const page = (system.pages || []).find((item) => item.id === pageId);
    if (page?.html) paths.add(page.html);
    if (typeof page?.data === 'string') paths.add(page.data);
  }
  const hashes = {};
  for (const relative of [...paths].sort()) {
    const file = assertInsideRoot(domainDir, path.join(domainDir, relative));
    try {
      hashes[relative] = sha256(await fs.readFile(file));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return hashes;
}

function pageSequence(system, pageId) {
  const occurrences = [];
  for (const component of system.components || []) {
    for (const occurrence of component.occurrences || []) {
      if (occurrence.pageId === pageId) occurrences.push({ componentId: component.id, index: occurrence.index ?? 0 });
    }
  }
  return occurrences.sort((a, b) => a.index - b.index).map((item) => item.componentId);
}

function collectAssetRefs(html) {
  const $ = cheerio.load(html || '');
  const refs = [];
  $('[src], [poster]').each((_i, element) => {
    for (const attr of ['src', 'poster']) {
      const value = $(element).attr(attr);
      if (value) refs.push(value);
    }
  });
  $('[srcset]').each((_i, element) => {
    const srcset = $(element).attr('srcset') || '';
    refs.push(...srcset.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean));
  });
  return refs;
}

async function pageContext(domainDir, page, system) {
  const html = page?.html
    ? await readTextIfExists(assertInsideRoot(domainDir, path.join(domainDir, page.html)))
    : '';
  const data = typeof page?.data === 'string'
    ? await readJsonIfExists(assertInsideRoot(domainDir, path.join(domainDir, page.data)))
    : {};
  const $ = cheerio.load(html || '');
  const firstImage = $('main img[src], body img[src]').first();
  const nextLink = $('.next-project a[href], [class*="next-project"] a[href], [class*="project-next"] a[href]').first();
  const heading = $('h1').first().text().trim() || $('h2').first().text().trim();
  const values = {
    title: data.title || page?.title || '',
    route: page?.route || '',
    url: page?.url || data.url || '',
    heading,
    image: firstImage.attr('src') || '',
    imageAlt: firstImage.attr('alt') || '',
    nextHref: nextLink.attr('href') || '',
    nextLabel: nextLink.text().trim() || '',
  };
  return {
    ...page,
    componentIds: pageSequence(system, page.id),
    values,
    html,
    assetRefs: collectAssetRefs(html),
  };
}

function annotateComponent(component) {
  const $ = cheerio.load(component.markup || '', null, false);
  if (['hero', 'project-hero'].includes(component.role)) {
    $('h1, h2, h3').first().attr('data-aspirator-bind', 'heading');
  }
  const image = $('img').first();
  if (image.length) image.attr('data-aspirator-bind-attr', 'src:image,alt:imageAlt');
  if (component.role === 'next-project') {
    const anchor = $('a[href]').first();
    if (anchor.length) {
      anchor.attr('data-aspirator-bind-attr', 'href:nextHref');
      anchor.attr('data-aspirator-bind', 'nextLabel');
    }
  }
  return { ...component, markup: $.root().html() || component.markup };
}

function rewriteMarkup(markup, rewrites) {
  const $ = cheerio.load(markup || '');
  $('[src], [poster], [href]').each((_i, element) => {
    for (const attr of ['src', 'poster', 'href']) {
      const value = $(element).attr(attr);
      if (value && rewrites[value]) $(element).attr(attr, rewrites[value]);
    }
  });
  $('[srcset]').each((_i, element) => {
    const srcset = $(element).attr('srcset') || '';
    const next = srcset.split(',').map((part) => {
      const pieces = part.trim().split(/\s+/);
      if (rewrites[pieces[0]]) pieces[0] = rewrites[pieces[0]];
      return pieces.join(' ');
    }).join(', ');
    $(element).attr('srcset', next);
  });
  $('[style]').each((_i, element) => {
    let style = $(element).attr('style') || '';
    for (const [source, target] of Object.entries(rewrites)) style = style.split(source).join(target);
    $(element).attr('style', style);
  });
  return $.html();
}

function rewriteFragment(markup, rewrites) {
  const wrapped = rewriteMarkup(`<body>${markup || ''}</body>`, rewrites);
  const $ = cheerio.load(wrapped);
  return $('body').html() || '';
}

function rewriteData(data, rewrites) {
  const pages = {};
  for (const [pageId, values] of Object.entries(data.pages || {})) {
    pages[pageId] = {};
    for (const [key, value] of Object.entries(values || {})) {
      pages[pageId][key] = typeof value === 'string' && rewrites[value] ? rewrites[value] : value;
    }
  }
  return { ...data, pages };
}

function rewriteCss(styles, urlMappings, rewrites) {
  const outputs = { ...styles };
  for (const key of ['tokensCss', 'baseCss', 'layoutCss', 'componentsCss']) {
    let css = outputs[key] || '';
    for (const mapping of urlMappings || []) {
      if (mapping.external || !mapping.raw) continue;
      const target = rewrites[mapping.resolved];
      if (!target) continue;
      css = css.split(mapping.raw).join(`../${target}`);
    }
    outputs[key] = css;
  }
  return outputs;
}

function assetIds(system, boundAssets) {
  const byPath = new Map((system.assets || []).map((asset) => [asset.path, asset.id]));
  return boundAssets.map((asset) => byPath.get(asset.source)).filter(Boolean);
}

async function writeJson(root, relative, value) {
  const target = assertInsideRoot(root, path.join(root, relative));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function publish({ rebuildRoot, stagingRoot }) {
  const parent = path.dirname(rebuildRoot);
  const backupRoot = path.join(parent, '.backup', path.basename(rebuildRoot));
  await fs.mkdir(path.dirname(backupRoot), { recursive: true });
  await fs.rm(backupRoot, { recursive: true, force: true });
  let hadExisting = false;
  try {
    await fs.access(rebuildRoot);
    hadExisting = true;
  } catch {}
  if (hadExisting) await fs.rename(rebuildRoot, backupRoot);
  try {
    await fs.rename(stagingRoot, rebuildRoot);
    await fs.rm(backupRoot, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(rebuildRoot, { recursive: true, force: true });
    if (hadExisting) await fs.rename(backupRoot, rebuildRoot);
    throw error;
  }
}

export async function rebuildArchetype({ domainDir, archetypeId } = {}) {
  const source = await resolveArchetypeSource({ domainDir, archetypeId });
  const { system, archetype, representativePage, rebuildPaths } = source;
  const { rebuildRoot, stagingRoot } = rebuildPaths;
  const sourceHashes = await hashEvidence(domainDir, system, archetype);

  await fs.rm(stagingRoot, { recursive: true, force: true });
  await fs.mkdir(stagingRoot, { recursive: true });

  try {
    const cleaned = cleanRebuildDocument({ html: source.sourceHtml, sourceUrl: representativePage.url });
    let sliced = sliceComponents({ html: cleaned.html, occurrences: source.componentOccurrences });
    if (sliced.unresolved.length) {
      const originalSlice = sliceComponents({ html: source.sourceHtml, occurrences: source.componentOccurrences });
      if (originalSlice.unresolved.length < sliced.unresolved.length) {
        const residualClean = cleanRebuildDocument({ html: originalSlice.residualHtml, sourceUrl: representativePage.url });
        sliced = { ...originalSlice, residualHtml: residualClean.html };
      }
    }

    const pageContexts = [];
    const allAssetRefs = [...source.assetRefs];
    for (const pageId of archetype.pageIds || []) {
      const page = (system.pages || []).find((item) => item.id === pageId);
      if (!page) continue;
      const context = await pageContext(domainDir, page, system);
      pageContexts.push(context);
      allAssetRefs.push(...context.assetRefs);
    }
    const representativeContext = pageContexts.find((page) => page.id === archetype.representativePageId)
      || { ...representativePage, componentIds: pageSequence(system, representativePage.id), values: {} };
    const candidatePages = pageContexts.filter((page) => page.id !== representativeContext.id);
    let data = extractArchetypeData({
      representativePage: representativeContext,
      representativeComponents: representativeContext.componentIds,
      candidatePages,
    });

    const styles = await compileStyles({
      sourceHtml: source.sourceHtml,
      sourceRoot: path.resolve(domainDir),
      markup: sliced.residualHtml,
    });
    if (styles.unresolved.length) {
      throw new RebuildError(REBUILD_CODES.CSS_UNRESOLVED, 'Required stylesheet could not be resolved', styles.unresolved);
    }

    const bound = await bindAssets({
      references: [...new Set([...allAssetRefs, ...styles.referencedUrls])],
      sourceRoot: path.resolve(domainDir),
      rebuildRoot: stagingRoot,
      assetRegistry: system.assets || [],
    });
    if (bound.unresolved.length) {
      throw new RebuildError(REBUILD_CODES.ASSET_UNRESOLVED, 'Required local assets could not be resolved', bound.unresolved);
    }

    data = rewriteData(data, bound.rewrites);
    const rewrittenComponents = sliced.components
      .map((component) => ({ ...component, markup: cleanRebuildFragment({ html: component.markup }).html }))
      .map(annotateComponent)
      .map((component) => ({ ...component, markup: rewriteFragment(component.markup, bound.rewrites) }));
    const rewrittenShell = rewriteMarkup(sliced.residualHtml, bound.rewrites);
    const rewrittenStyles = rewriteCss(styles.outputs, styles.urlMappings, bound.rewrites);

    const runtime = await buildVanillaRuntime({
      rebuildRoot: stagingRoot,
      archetype,
      shellHtml: rewrittenShell,
      components: rewrittenComponents,
      data,
      styles: rewrittenStyles,
    });

    const generatedFiles = [...runtime.generatedFiles, ...bound.assets.map((asset) => asset.target)].sort();
    const componentIds = [...new Set(rewrittenComponents.map((item) => item.componentId).filter(Boolean))].sort();
    const pageIds = Object.keys(data.pages || {}).sort();
    const preliminary = {
      version: '1.0',
      domain: system.domain,
      archetypeId: archetype.id,
      representativePageId: archetype.representativePageId,
      target: 'vanilla',
      generatedFiles,
      componentIds,
      assetIds: assetIds(system, bound.assets),
      pageIds,
      excludedPageIds: data.excludedPageIds || [],
      diagnostics: {
        unresolvedComponents: sliced.unresolved,
        externalAssets: bound.external,
        fontReferences: bound.fontReferences,
        cssMode: styles.mode,
      },
    };

    const report = await verifyRebuild({ domainDir, rebuildRoot: stagingRoot, manifest: preliminary, sourceHashes });
    preliminary.verification = {
      status: report.status,
      brokenResources: report.metrics.brokenLinks,
      missingComponents: report.metrics.missingComponents,
    };
    await writeJson(stagingRoot, 'reports/fidelity.json', report);
    preliminary.generatedFiles = [...preliminary.generatedFiles, 'reports/fidelity.json', 'rebuild-manifest.json'].sort();
    await writeJson(stagingRoot, 'rebuild-manifest.json', preliminary);

    if (report.status !== 'pass') {
      throw new RebuildError(REBUILD_CODES.VERIFY_FAILED, 'Rebuild verification failed', report);
    }

    await publish({ rebuildRoot, stagingRoot });
    return preliminary;
  } catch (error) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}
