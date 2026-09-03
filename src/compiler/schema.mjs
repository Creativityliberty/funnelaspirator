import path from 'path';

export const SITE_SYSTEM_VERSION = '1.0';

export function assertInsideRoot(rootDir, candidatePath) {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    throw new Error(`Path escapes export root: ${candidatePath}`);
  }
  return candidate;
}

export function makePageId(index) {
  return `page-${String(index + 1).padStart(3, '0')}`;
}

export function emptySiteSystem(domain = '') {
  return {
    version: SITE_SYSTEM_VERSION,
    domain,
    stats: { pages: 0, archetypes: 0, components: 0, assets: 0 },
    pages: [],
    archetypes: [],
    components: [],
    assets: [],
    designSystem: {},
    motion: {},
    generatedAt: null,
  };
}
