import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { assertInsideRoot } from '../compiler/schema.mjs';

const EXTERNAL = /^(?:https?:|data:|blob:|\/\/)/i;
const FONT_EXT = /\.(?:woff2?|ttf|otf)(?:$|[?#])/i;
const EXECUTABLE_EXT = /\.(?:js|mjs|cjs)(?:$|[?#])/i;
const TRACKING = /googletagmanager|google-analytics|facebook\.net|posthog|segment\.com|citeme\.io|visitors\.now|clarity\.ms|hotjar|plausible\.io/i;
const NEXT_IMAGE_OPTIMIZER = /^\/?_next\/image\?/i;
const CAPTURED_ASSET_PARENT = /^(?:\.\.\/)+assets\//;

function stripQuery(value = '') {
  return String(value).split('#')[0].split('?')[0];
}

function portable(value) {
  return String(value).split(path.sep).join('/');
}

function capturedAssetPath(value = '') {
  const clean = String(value).replaceAll('\\', '/');
  return CAPTURED_ASSET_PARENT.test(clean)
    ? clean.replace(/^(?:\.\.\/)+/, '')
    : null;
}

function registryCandidate(reference, assetRegistry) {
  const clean = stripQuery(reference).replace(/^\//, '');
  const captured = capturedAssetPath(clean);
  return (assetRegistry || []).find((asset) => {
    const pathValue = String(asset?.path || '').replace(/^\//, '');
    const sourceValue = String(asset?.source || asset?.url || '').replace(/^\//, '');
    return pathValue === clean
      || (captured && pathValue === captured)
      || sourceValue === reference
      || sourceValue === clean
      || (captured && sourceValue === captured);
  });
}

async function resolveLocalReference(sourceRoot, reference, assetRegistry) {
  const clean = stripQuery(reference);
  const fromRegistry = registryCandidate(reference, assetRegistry);
  const candidates = [];
  if (fromRegistry?.path) candidates.push(fromRegistry.path);
  const captured = capturedAssetPath(clean);
  if (captured) candidates.push(captured);
  if (clean.startsWith('/')) candidates.push(clean.slice(1));
  else candidates.push(clean);

  for (const relative of [...new Set(candidates)]) {
    try {
      const absolute = assertInsideRoot(sourceRoot, path.join(sourceRoot, relative));
      const stat = await fs.stat(absolute);
      if (stat.isFile()) return { absolute, relative: portable(path.relative(sourceRoot, absolute)) };
    } catch (error) {
      if (error?.code !== 'ENOENT' && !String(error?.message || '').includes('escapes export root')) throw error;
    }
  }
  return null;
}

export async function bindAssets({ references = [], sourceRoot, rebuildRoot, assetRegistry = [] } = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required');
  if (!rebuildRoot) throw new Error('rebuildRoot is required');
  const source = path.resolve(sourceRoot);
  const targetRoot = path.resolve(rebuildRoot);
  const assetsDir = path.join(targetRoot, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });

  const assets = [];
  const rewrites = {};
  const external = [];
  const unresolved = [];
  const fontReferences = [];
  const ignored = [];
  const seen = new Map();

  for (const rawReference of references || []) {
    const reference = String(rawReference || '').trim();
    if (!reference || reference.startsWith('#')) continue;
    if (NEXT_IMAGE_OPTIMIZER.test(reference) || EXECUTABLE_EXT.test(reference) || TRACKING.test(reference)) {
      ignored.push(reference);
      continue;
    }
    if (EXTERNAL.test(reference)) {
      external.push(reference);
      continue;
    }
    if (FONT_EXT.test(reference)) {
      fontReferences.push(reference);
      continue;
    }

    const resolved = await resolveLocalReference(source, reference, assetRegistry);
    if (!resolved) {
      unresolved.push({ reference, reason: 'not-found' });
      continue;
    }

    const bytes = await fs.readFile(resolved.absolute);
    const hash = crypto.createHash('sha1').update(bytes).digest('hex');
    const fileName = `${hash.slice(0, 8)}-${path.basename(resolved.relative)}`;
    const targetRel = path.posix.join('assets', fileName);
    const targetAbs = assertInsideRoot(targetRoot, path.join(targetRoot, targetRel));

    if (!seen.has(hash)) {
      await fs.mkdir(path.dirname(targetAbs), { recursive: true });
      await fs.writeFile(targetAbs, bytes);
      const record = {
        source: resolved.relative,
        target: targetRel,
        hash,
        bytes: bytes.length,
      };
      seen.set(hash, record);
      assets.push(record);
    }

    rewrites[reference] = seen.get(hash).target;
  }

  return {
    assets,
    rewrites,
    external: [...new Set(external)],
    unresolved,
    fontReferences: [...new Set(fontReferences)],
    ignored: [...new Set(ignored)],
  };
}
