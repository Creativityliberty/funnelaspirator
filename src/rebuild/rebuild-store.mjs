import fs from 'fs/promises';
import path from 'path';
import { resolveDomainDir } from '../compiler/system-store.mjs';
import { resolveRebuildPaths } from './paths.mjs';

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function readRebuildManifest(exportsDir, domain, archetypeId) {
  const domainDir = resolveDomainDir(exportsDir, domain);
  const { rebuildRoot } = resolveRebuildPaths(domainDir, archetypeId);
  try {
    return await readJson(path.join(rebuildRoot, 'rebuild-manifest.json'));
  } catch (error) {
    if (error?.code === 'ENOENT') throw Object.assign(new Error('Rebuild manifest not found'), { code: 'SOURCE_MISSING' });
    throw error;
  }
}

export async function readRebuildReport(exportsDir, domain, archetypeId) {
  const domainDir = resolveDomainDir(exportsDir, domain);
  const { rebuildRoot } = resolveRebuildPaths(domainDir, archetypeId);
  try {
    return await readJson(path.join(rebuildRoot, 'reports', 'fidelity.json'));
  } catch (error) {
    if (error?.code === 'ENOENT') throw Object.assign(new Error('Rebuild report not found'), { code: 'SOURCE_MISSING' });
    throw error;
  }
}
