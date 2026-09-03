import path from 'path';
import { fileURLToPath } from 'url';
import { compileSiteSystem } from './compiler/compile-site.mjs';
import { resolveCompileTarget } from './compiler/compile-target.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const input = process.argv[2];

if (!input) {
  console.error('Usage: node src/compile-cli.mjs <domain-folder|domain-export-dir>');
  process.exit(1);
}

try {
  const target = resolveCompileTarget(input, { cwd: process.cwd(), projectRoot });
  const system = await compileSiteSystem({ exportDir: target.exportDir, write: true });
  console.log(JSON.stringify({
    success: true,
    target: target.label,
    mode: target.mode,
    exportDir: target.exportDir,
    stats: system.stats,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    success: false,
    target: input,
    error: error.message,
  }, null, 2));
  process.exit(1);
}
