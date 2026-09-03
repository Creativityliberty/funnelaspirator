import fs from 'fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('general verification workflow covers M01 and M02 gates', async () => {
  const workflow = await fs.readFile('.github/workflows/verify.yml', 'utf8');
  assert.match(workflow, /pull_request:[\s\S]*main/);
  assert.match(workflow, /push:[\s\S]*feat\/\*\*/);
  for (const command of [
    'npm ci',
    'node --check src/server.mjs',
    'node --check src/rebuild/rebuild-archetype.mjs',
    'node --check src/rebuild/runtime-builder.mjs',
    'node --check src/rebuild/verifier.mjs',
    'node --check src/rebuild-cli.mjs',
    'node --check public/studio/explorer.js',
    'node --check public/studio/preview.js',
    'node --check public/studio/system-inspector.js',
    'npm test',
    'npm run test:mcp',
  ]) {
    assert.ok(workflow.includes(command), `missing ${command}`);
  }
});
