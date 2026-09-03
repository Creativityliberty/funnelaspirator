import fs from 'fs/promises';
import path from 'path';
import { assertInsideRoot } from './schema.mjs';

export function resolveDomainDir(exportsDir, domain) {
  if (!/^[a-z0-9.-]+$/i.test(String(domain || ''))) {
    throw new Error('Invalid domain');
  }
  return assertInsideRoot(exportsDir, path.join(exportsDir, domain));
}

export async function readCompiledSystem(exportsDir, domain) {
  const domainDir = resolveDomainDir(exportsDir, domain);
  const file = assertInsideRoot(domainDir, path.join(domainDir, 'system', 'site-system.json'));
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const notFound = new Error('Compiled site system not found');
      notFound.code = 'SYSTEM_NOT_FOUND';
      throw notFound;
    }
    throw error;
  }
}

export function findById(items, id, label = 'item') {
  const item = (items || []).find((entry) => entry.id === id);
  if (!item) {
    const error = new Error(`${label} not found`);
    error.code = 'ITEM_NOT_FOUND';
    throw error;
  }
  return item;
}
