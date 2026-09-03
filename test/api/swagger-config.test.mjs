import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverCorePath = path.join(__dirname, '..', '..', 'src', 'server-core.mjs');

test('Swagger scans the file that still contains the legacy API annotations', async () => {
  const source = await fs.readFile(serverCorePath, 'utf8');
  assert.match(source, /apis:\s*\[['"]\.\/src\/server-core\.mjs['"]\]/);
});
