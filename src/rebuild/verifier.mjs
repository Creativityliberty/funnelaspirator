import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { assertInsideRoot } from '../compiler/schema.mjs';

const EXTERNAL = /^(?:https?:|data:|blob:|mailto:|tel:|javascript:|\/\/|#)/i;
const TRACKING = /googletagmanager|google-analytics|facebook\.net|posthog|self\.__next_f|__NEXT_DATA__/i;
const FONT_EXT = /\.(?:woff2?|ttf|otf)(?:$|[?#])/i;

async function exists(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function normalizeRef(value = '') {
  return String(value).trim().split('#')[0].split('?')[0];
}

function localTarget(root, fromFile, reference) {
  const clean = normalizeRef(reference);
  if (!clean || EXTERNAL.test(clean)) return null;
  try {
    return clean.startsWith('/')
      ? assertInsideRoot(root, path.join(root, clean.slice(1)))
      : assertInsideRoot(root, path.resolve(path.dirname(fromFile), clean));
  } catch {
    return Symbol.for('escape');
  }
}

function htmlRefs(html) {
  const $ = cheerio.load(html || '');
  const refs = [];
  $('script[src], link[href], img[src], source[src], video[src], video[poster], audio[src], iframe[src]').each((_i, element) => {
    for (const attr of ['src', 'href', 'poster']) {
      const value = $(element).attr(attr);
      if (value) refs.push(value);
    }
  });
  $('[srcset]').each((_i, element) => {
    const value = $(element).attr('srcset') || '';
    refs.push(...value.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean));
  });
  return refs;
}

function cssRefs(css) {
  const refs = [];
  const regex = /url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi;
  let match;
  while ((match = regex.exec(css || ''))) refs.push(match[2]);
  return refs;
}

function jsRefs(js) {
  const refs = [];
  const regex = /(?:import\s+(?:[^'";]+?\s+from\s+)?|import\s*\()\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(js || ''))) refs.push(match[1]);
  return refs;
}

async function verifyReferences(rebuildRoot, generatedFiles) {
  const broken = [];
  const referenced = [];
  const fontReferences = [];

  for (const relative of generatedFiles || []) {
    const file = assertInsideRoot(rebuildRoot, path.join(rebuildRoot, relative));
    if (!(await exists(file))) {
      broken.push({ from: relative, reference: relative, reason: 'declared-file-missing' });
      continue;
    }
    const ext = path.extname(relative).toLowerCase();
    if (!['.html', '.css', '.js', '.mjs'].includes(ext)) continue;
    const text = await fs.readFile(file, 'utf8');
    const refs = ext === '.html' ? htmlRefs(text) : ext === '.css' ? cssRefs(text) : jsRefs(text);
    for (const reference of refs) {
      if (FONT_EXT.test(reference)) {
        const target = localTarget(rebuildRoot, file, reference);
        const available = Boolean(target && target !== Symbol.for('escape') && await exists(target));
        fontReferences.push({ from: relative, reference, available });
        continue;
      }

      const target = localTarget(rebuildRoot, file, reference);
      if (!target) continue;
      referenced.push({ from: relative, reference });
      if (target === Symbol.for('escape')) {
        broken.push({ from: relative, reference, reason: 'output-escape' });
      } else if (!(await exists(target))) {
        broken.push({ from: relative, reference, reason: 'not-found' });
      }
    }
  }
  return { broken, referenced, fontReferences };
}

async function verifySourceHashes(domainDir, sourceHashes) {
  const mismatches = [];
  for (const [relative, expected] of Object.entries(sourceHashes || {})) {
    let file;
    try {
      file = assertInsideRoot(domainDir, path.join(domainDir, relative));
    } catch {
      mismatches.push({ path: relative, reason: 'escape' });
      continue;
    }
    if (!(await exists(file))) {
      mismatches.push({ path: relative, reason: 'missing' });
      continue;
    }
    const actual = hash(await fs.readFile(file));
    if (actual !== expected) mismatches.push({ path: relative, reason: 'hash-mismatch', expected, actual });
  }
  return mismatches;
}

export async function verifyRebuild({ domainDir, rebuildRoot, manifest = {}, sourceHashes = {} } = {}) {
  const domain = path.resolve(domainDir);
  const root = path.resolve(rebuildRoot);
  let isolated = true;
  try {
    assertInsideRoot(domain, root);
  } catch {
    isolated = false;
  }

  const indexPath = isolated ? path.join(root, 'index.html') : null;
  const indexExists = Boolean(indexPath && await exists(indexPath));
  let documentOk = false;
  if (indexExists) {
    const index = await fs.readFile(indexPath, 'utf8');
    const $ = cheerio.load(index);
    documentOk = $('html').length === 1 && $('body').length === 1;
  }

  const refs = isolated
    ? await verifyReferences(root, manifest.generatedFiles || [])
    : { broken: [], referenced: [], fontReferences: [] };
  const sourceMismatches = await verifySourceHashes(domain, sourceHashes);
  const registryPath = isolated ? path.join(root, 'components', 'registry.js') : null;
  const registry = registryPath && await exists(registryPath) ? await fs.readFile(registryPath, 'utf8') : '';
  const expectedComponents = [...new Set(manifest.componentIds || [])];
  const missingComponents = expectedComponents.filter((id) => !registry.includes(JSON.stringify(id)) && !registry.includes(`'${id}'`));

  let trackingFound = false;
  for (const relative of manifest.generatedFiles || []) {
    if (!/\.(?:html|js|mjs)$/i.test(relative)) continue;
    const file = path.join(root, relative);
    if (!(await exists(file))) continue;
    if (TRACKING.test(await fs.readFile(file, 'utf8'))) {
      trackingFound = true;
      break;
    }
  }

  const checks = {
    document: documentOk ? 'pass' : 'fail',
    resources: refs.broken.length === 0 ? 'pass' : 'fail',
    components: missingComponents.length === 0 ? 'pass' : 'fail',
    navigation: refs.broken.filter((item) => item.reason === 'navigation').length === 0 ? 'pass' : 'fail',
    sourceIntegrity: sourceMismatches.length === 0 ? 'pass' : 'fail',
    tracking: trackingFound ? 'fail' : 'pass',
    outputIsolation: isolated ? 'pass' : 'fail',
  };
  const status = Object.values(checks).every((value) => value === 'pass') ? 'pass' : 'fail';

  const assetRef = (item) => /(?:assets\/|\.(?:png|jpe?g|webp|svg|gif|avif|mp4|webm))/i.test(item.reference);
  const referencedAssets = refs.referenced.filter(assetRef);
  const brokenAssets = refs.broken.filter(assetRef);

  return {
    status,
    checks,
    metrics: {
      componentsExpected: expectedComponents.length,
      componentsResolved: expectedComponents.length - missingComponents.length,
      assetsReferenced: referencedAssets.length,
      assetsResolved: referencedAssets.length - brokenAssets.length,
      brokenLinks: refs.broken.length,
      missingComponents: missingComponents.length,
      sourceMismatches: sourceMismatches.length,
      fontReferences: refs.fontReferences.length,
      fontReferencesMissing: refs.fontReferences.filter((item) => !item.available).length,
    },
    brokenResources: refs.broken,
    fontReferences: refs.fontReferences,
    missingComponents,
    sourceMismatches,
    visual: { status: 'not-scored' },
  };
}
