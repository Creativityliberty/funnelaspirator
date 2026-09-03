import path from 'path';
import { assertInsideRoot } from '../compiler/schema.mjs';
import { RebuildError, REBUILD_CODES } from './errors.mjs';

export function validateArchetypeId(archetypeId) {
  const value = String(archetypeId || '');
  if (!/^arch-[a-z0-9-]+$/i.test(value)) {
    throw new RebuildError(REBUILD_CODES.INVALID_ARCHETYPE, `Invalid archetype id: ${value}`);
  }
  return value;
}

export function resolveRebuildPaths(domainDir, archetypeId) {
  const root = path.resolve(domainDir);
  const safeId = validateArchetypeId(archetypeId);
  try {
    return {
      domainRoot: root,
      rebuildRoot: assertInsideRoot(root, path.join(root, 'rebuild', safeId)),
      stagingRoot: assertInsideRoot(root, path.join(root, 'rebuild', '.staging', safeId)),
    };
  } catch (error) {
    throw new RebuildError(REBUILD_CODES.OUTPUT_ESCAPE, error.message);
  }
}
