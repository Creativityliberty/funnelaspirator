import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { assertInsideRoot } from './schema.mjs';

const EXCLUDED_DIRS = new Set(['data', 'pages', 'screenshots', 'system']);
const EXCLUDED_FILES = new Set(['sitemap.json', 'design-system.json']);

function kindForExtension(ext = '') {
  const normalized = ext.toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico'].includes(normalized)) return 'image';
  if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(normalized)) return 'font';
  if (normalized === '.css') return 'style';
  if (['.js', '.mjs', '.cjs'].includes(normalized)) return 'script';
  if (['.mp4', '.webm', '.mov', '.m4v', '.mp3', '.wav', '.ogg'].includes(normalized)) return 'media';
  return 'other';
}

async function walk(root, current = root, output = []) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name) && current === root) continue;
    const absolute = assertInsideRoot(root, path.join(current, entry.name));
    if (entry.isDirectory()) {
      await walk(root, absolute, output);
      continue;
    }

    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (EXCLUDED_FILES.has(relative)) continue;
    const stat = await fs.stat(absolute);
    const extension = path.extname(entry.name).toLowerCase();
    const hash = crypto.createHash('sha1').update(relative).digest('hex').slice(0, 10);
    output.push({
      id: `asset-${hash}`,
      path: relative,
      extension,
      kind: kindForExtension(extension),
      bytes: stat.size,
    });
  }
  return output;
}

export async function buildAssetRegistry(exportDir) {
  const root = path.resolve(exportDir);
  try {
    return (await walk(root)).sort((a, b) => a.path.localeCompare(b.path));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}
