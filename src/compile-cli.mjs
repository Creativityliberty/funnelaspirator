import path from 'path';
import { fileURLToPath } from 'url';
import { compileSiteSystem } from './compiler/compile-site.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const domain = process.argv[2];

if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) {
  console.error('Usage: node src/compile-cli.mjs <domain-folder>');
  process.exit(1);
}

const exportDir = path.join(__dirname, '..', 'exports', domain);

try {
  const system = await compileSiteSystem({ exportDir, write: true });
  console.log(JSON.stringify({ success: true, domain, stats: system.stats }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ success: false, domain, error: error.message }, null, 2));
  process.exit(1);
}
