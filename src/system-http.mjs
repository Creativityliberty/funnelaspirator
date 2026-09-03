import path from 'path';
import { compileSiteSystem } from './compiler/compile-site.mjs';
import { readCompiledSystem, resolveDomainDir, findById } from './compiler/system-store.mjs';
import { rebuildArchetype } from './rebuild/rebuild-archetype.mjs';
import { readRebuildManifest, readRebuildReport } from './rebuild/rebuild-store.mjs';
import { resolveRebuildPaths } from './rebuild/paths.mjs';

function statusFor(error) {
  const statusByCode = {
    SYSTEM_NOT_FOUND: 404,
    ITEM_NOT_FOUND: 404,
    SOURCE_MISSING: 404,
    INVALID_ARCHETYPE: 404,
    COMPONENT_UNRESOLVED: 422,
    ASSET_UNRESOLVED: 422,
    CSS_UNRESOLVED: 422,
    OUTPUT_ESCAPE: 400,
    VERIFY_FAILED: 422,
  };
  return statusByCode[error?.code] || 400;
}

export function registerSystemRoutes(app, { exportsDir }) {
  app.post('/api/results/:domain/compile', async (req, res) => {
    try {
      const domainDir = resolveDomainDir(exportsDir, req.params.domain);
      const system = await compileSiteSystem({ exportDir: domainDir, write: true });
      res.json({ success: true, domain: req.params.domain, system });
    } catch (error) {
      res.status(statusFor(error)).json({ success: false, error: error.message });
    }
  });

  app.get('/api/results/:domain/system', async (req, res) => {
    try { res.json({ success: true, domain: req.params.domain, system: await readCompiledSystem(exportsDir, req.params.domain) }); }
    catch (error) { res.status(statusFor(error)).json({ success: false, error: error.message }); }
  });

  app.get('/api/results/:domain/system/pages', async (req, res) => {
    try { const system = await readCompiledSystem(exportsDir, req.params.domain); res.json({ success: true, domain: req.params.domain, pages: system.pages }); }
    catch (error) { res.status(statusFor(error)).json({ success: false, error: error.message }); }
  });

  app.get('/api/results/:domain/system/pages/:pageId', async (req, res) => {
    try { const system = await readCompiledSystem(exportsDir, req.params.domain); res.json({ success: true, domain: req.params.domain, page: findById(system.pages, req.params.pageId, 'page') }); }
    catch (error) { res.status(statusFor(error)).json({ success: false, error: error.message }); }
  });

  app.get('/api/results/:domain/system/archetypes', async (req, res) => {
    try { const system = await readCompiledSystem(exportsDir, req.params.domain); res.json({ success: true, domain: req.params.domain, archetypes: system.archetypes }); }
    catch (error) { res.status(statusFor(error)).json({ success: false, error: error.message }); }
  });

  app.get('/api/results/:domain/system/archetypes/:archetypeId', async (req, res) => {
    try { const system = await readCompiledSystem(exportsDir, req.params.domain); res.json({ success: true, domain: req.params.domain, archetype: findById(system.archetypes, req.params.archetypeId, 'archetype') }); }
    catch (error) { res.status(statusFor(error)).json({ success: false, error: error.message }); }
  });

  app.get('/api/results/:domain/system/components', async (req, res) => {
    try { const system = await readCompiledSystem(exportsDir, req.params.domain); res.json({ success: true, domain: req.params.domain, components: system.components }); }
    catch (error) { res.status(statusFor(error)).json({ success: false, error: error.message }); }
  });

  app.get('/api/results/:domain/system/components/:componentId', async (req, res) => {
    try { const system = await readCompiledSystem(exportsDir, req.params.domain); res.json({ success: true, domain: req.params.domain, component: findById(system.components, req.params.componentId, 'component') }); }
    catch (error) { res.status(statusFor(error)).json({ success: false, error: error.message }); }
  });

  app.get('/api/results/:domain/system/preview/:pageId', async (req, res) => {
    try {
      const system = await readCompiledSystem(exportsDir, req.params.domain);
      const page = findById(system.pages, req.params.pageId, 'page');
      if (!page.preview) throw Object.assign(new Error('Preview not available'), { code: 'ITEM_NOT_FOUND' });
      const domainDir = resolveDomainDir(exportsDir, req.params.domain);
      res.sendFile(path.resolve(domainDir, page.preview));
    } catch (error) {
      res.status(statusFor(error)).json({ success: false, error: error.message });
    }
  });

  app.post('/api/results/:domain/system/rebuild/archetypes/:archetypeId', async (req, res) => {
    try {
      const domainDir = resolveDomainDir(exportsDir, req.params.domain);
      const manifest = await rebuildArchetype({ domainDir, archetypeId: req.params.archetypeId });
      res.json({ success: true, domain: req.params.domain, manifest });
    } catch (error) {
      res.status(statusFor(error)).json({ success: false, code: error?.code || null, error: error.message });
    }
  });

  app.get('/api/results/:domain/system/rebuild/archetypes/:archetypeId', async (req, res) => {
    try {
      const manifest = await readRebuildManifest(exportsDir, req.params.domain, req.params.archetypeId);
      res.json({ success: true, domain: req.params.domain, manifest });
    } catch (error) {
      res.status(statusFor(error)).json({ success: false, code: error?.code || null, error: error.message });
    }
  });

  app.get('/api/results/:domain/system/rebuild/archetypes/:archetypeId/report', async (req, res) => {
    try {
      const report = await readRebuildReport(exportsDir, req.params.domain, req.params.archetypeId);
      res.json({ success: true, domain: req.params.domain, report });
    } catch (error) {
      res.status(statusFor(error)).json({ success: false, code: error?.code || null, error: error.message });
    }
  });

  app.get('/api/results/:domain/system/rebuild/archetypes/:archetypeId/preview', async (req, res) => {
    try {
      const manifest = await readRebuildManifest(exportsDir, req.params.domain, req.params.archetypeId);
      if (!(manifest.generatedFiles || []).includes('index.html')) {
        throw Object.assign(new Error('Rebuild preview not available'), { code: 'SOURCE_MISSING' });
      }
      const domainDir = resolveDomainDir(exportsDir, req.params.domain);
      const { rebuildRoot } = resolveRebuildPaths(domainDir, req.params.archetypeId);
      res.sendFile(path.resolve(rebuildRoot, 'index.html'));
    } catch (error) {
      res.status(statusFor(error)).json({ success: false, code: error?.code || null, error: error.message });
    }
  });
}
