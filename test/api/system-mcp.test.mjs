import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSystemTools } from '../../src/system-mcp.mjs';

test('registerSystemTools preserves eight compiled-system tools and adds three rebuild tools', () => {
  const tools = [];
  const mcpServer = { registerTool: (name, schema, handler) => tools.push({ name, schema, handler }) };
  const z = { string: () => ({}), object: (shape) => ({ shape }) };
  registerSystemTools(mcpServer, { exportsDir: '/tmp/exports', z });
  assert.deepEqual(tools.map((item) => item.name), [
    'compile_site_system',
    'get_site_system',
    'list_site_pages',
    'list_archetypes',
    'list_components',
    'get_site_page',
    'get_archetype',
    'get_component',
    'rebuild_archetype',
    'get_rebuild_manifest',
    'get_rebuild_report',
  ]);
});
