import fs from 'fs/promises';
import path from 'path';
import { assertInsideRoot, makePageId } from './schema.mjs';
import { deriveComponentsFromHtml, deriveComponentsFromSections } from './html-components.mjs';

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

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function routeFromUrl(urlValue) {
  try {
    const url = new URL(urlValue);
    return `${url.pathname || '/'}${url.search || ''}`;
  } catch {
    return '/';
  }
}

function domainFromPages(sitemap) {
  for (const page of sitemap) {
    try {
      return new URL(page.url).hostname;
    } catch {}
  }
  return '';
}

function candidateDataRefs(page) {
  const refs = [];
  if (page.data) refs.push(page.data);
  if (page.dataPath) refs.push(page.dataPath);
  if (page.json) refs.push(page.json);
  const htmlRef = page.html || page.htmlPath;
  if (htmlRef) {
    const base = path.basename(htmlRef, path.extname(htmlRef));
    refs.push(path.join('data', `${base}.json`));
  }
  return [...new Set(refs.filter(Boolean))];
}

export async function loadSiteExportV2(exportDir) {
  const root = path.resolve(exportDir);
  const sitemapPath = assertInsideRoot(root, path.join(root, 'sitemap.json'));
  let sitemap;
  try {
    sitemap = await readJson(sitemapPath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`sitemap.json not found in ${root}`);
    throw error;
  }
  if (!Array.isArray(sitemap)) throw new Error('sitemap.json must contain an array');

  const designSystem = await readJsonIfExists(
    assertInsideRoot(root, path.join(root, 'design-system.json')),
  ) || {};

  const pages = [];
  for (let index = 0; index < sitemap.length; index += 1) {
    const source = sitemap[index] || {};
    let pageData = null;
    for (const ref of candidateDataRefs(source)) {
      const candidate = assertInsideRoot(root, path.join(root, ref));
      pageData = await readJsonIfExists(candidate);
      if (pageData) break;
    }

    const html = source.html || source.htmlPath || pageData?.html || null;
    const screenshot = source.screenshot || source.screenshotPath || pageData?.screenshot || null;
    const url = source.url || pageData?.url || '';
    const htmlText = html
      ? await readTextIfExists(assertInsideRoot(root, path.join(root, html)))
      : null;

    const explicit = Array.isArray(pageData?.components) ? pageData.components : [];
    const fromHtml = explicit.length ? [] : deriveComponentsFromHtml(htmlText);
    const fromSections = explicit.length || fromHtml.length
      ? []
      : deriveComponentsFromSections(pageData?.sections);
    const components = explicit.length ? explicit : (fromHtml.length ? fromHtml : fromSections);

    pages.push({
      id: makePageId(index),
      index,
      url,
      route: routeFromUrl(url),
      title: source.title || pageData?.title || '',
      html,
      screenshot,
      data: pageData || {},
      designTokens: pageData?.designTokens || {},
      motion: pageData?.motion || {},
      microInteractions: pageData?.microInteractions || {},
      components,
      source,
    });
  }

  return { root, domain: domainFromPages(sitemap), sitemap, pages, designSystem };
}
