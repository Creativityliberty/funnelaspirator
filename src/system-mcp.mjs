import { compileSiteSystem } from './compiler/compile-site.mjs';
import { readCompiledSystem, resolveDomainDir, findById } from './compiler/system-store.mjs';

function payload(value) {
  return {
    structuredContent: value,
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

function failure(error) {
  return { isError: true, content: [{ type: 'text', text: error.message }] };
}

export function registerSystemTools(mcpServer, { exportsDir, z }) {
  const domainSchema = z.object({ domain: z.string() });

  const registerEntity = (name, key, listKey, label) => {
    mcpServer.registerTool(
      name,
      {
        description: `Get one compiled ${label}.`,
        inputSchema: z.object({ domain: z.string(), [key]: z.string() }),
        annotations: { readOnlyHint: true },
      },
      async (args) => {
        try {
          const system = await readCompiledSystem(exportsDir, args.domain);
          return payload({ success: true, domain: args.domain, [label]: findById(system[listKey], args[key], label) });
        } catch (error) {
          return failure(error);
        }
      },
    );
  };

  mcpServer.registerTool(
    'compile_site_system',
    {
      description: 'Compile an existing crawl into pages, archetypes, reusable components, assets and local previews.',
      inputSchema: domainSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ domain }) => {
      try {
        const exportDir = resolveDomainDir(exportsDir, domain);
        return payload({ success: true, domain, system: await compileSiteSystem({ exportDir, write: true }) });
      } catch (error) {
        return failure(error);
      }
    },
  );

  mcpServer.registerTool(
    'get_site_system',
    {
      description: 'Get a compiled site-system manifest.',
      inputSchema: domainSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ domain }) => {
      try { return payload({ success: true, domain, system: await readCompiledSystem(exportsDir, domain) }); }
      catch (error) { return failure(error); }
    },
  );

  for (const [name, key] of [
    ['list_site_pages', 'pages'],
    ['list_archetypes', 'archetypes'],
    ['list_components', 'components'],
  ]) {
    mcpServer.registerTool(
      name,
      { description: `List compiled ${key}.`, inputSchema: domainSchema, annotations: { readOnlyHint: true } },
      async ({ domain }) => {
        try {
          const system = await readCompiledSystem(exportsDir, domain);
          return payload({ success: true, domain, [key]: system[key] });
        } catch (error) {
          return failure(error);
        }
      },
    );
  }

  registerEntity('get_site_page', 'pageId', 'pages', 'page');
  registerEntity('get_archetype', 'archetypeId', 'archetypes', 'archetype');
  registerEntity('get_component', 'componentId', 'components', 'component');
}
