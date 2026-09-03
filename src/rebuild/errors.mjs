export class RebuildError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'RebuildError';
    this.code = code;
    this.details = details;
  }
}

export const REBUILD_CODES = Object.freeze({
  SOURCE_MISSING: 'SOURCE_MISSING',
  INVALID_ARCHETYPE: 'INVALID_ARCHETYPE',
  COMPONENT_UNRESOLVED: 'COMPONENT_UNRESOLVED',
  ASSET_UNRESOLVED: 'ASSET_UNRESOLVED',
  CSS_UNRESOLVED: 'CSS_UNRESOLVED',
  OUTPUT_ESCAPE: 'OUTPUT_ESCAPE',
  VERIFY_FAILED: 'VERIFY_FAILED',
});
