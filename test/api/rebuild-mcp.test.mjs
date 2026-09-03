import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSystemTools } from '../../src/system-mcp.mjs';

test('registerSystemTools exposes M02 rebuild tools with safe annotations', () => {
  const tools = [];
  const mcpServer = { registerTool: (name, schema, handler) => tools.push({ name, schema, handler }) };
  const z = { string: () => ({}), object: (shape) => ({ shape }) };

  registerSystemTools(mcpServer, { exportsDir: '/tmp/exports', z });
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const name of ['rebuild_archetype', 'get_rebuild_manifest', 'get_rebuild_report']) {
    assert.ok(byName.has(name), `missing ${name}`);
  }

  assert.deepEqual(byName.get('rebuild_archetype').schema.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  });
  assert.equal(byName.get('get_rebuild_manifest').schema.annotations.readOnlyHint, true);
  assert.equal(byName.get('get_rebuild_report').schema.annotations.readOnlyHint, true);
});
