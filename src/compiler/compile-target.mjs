import path from 'path';

function isExplicitPath(value = '') {
  return path.isAbsolute(value) || value.startsWith('./') || value.startsWith('../') || value.includes(path.sep);
}

export function resolveCompileTarget(value, { cwd = process.cwd(), projectRoot = cwd } = {}) {
  const input = String(value || '').trim();
  if (!input) throw new Error('Compile target is required');

  if (isExplicitPath(input)) {
    const exportDir = path.resolve(cwd, input);
    return {
      exportDir,
      label: path.basename(exportDir),
      mode: 'path',
    };
  }

  if (!/^[a-z0-9.-]+$/i.test(input)) {
    throw new Error('Invalid domain folder');
  }

  return {
    exportDir: path.join(path.resolve(projectRoot), 'exports', input),
    label: input,
    mode: 'domain',
  };
}
