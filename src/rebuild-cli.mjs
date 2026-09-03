import path from 'path';
import { rebuildArchetype } from './rebuild/rebuild-archetype.mjs';

export async function runRebuildCli(argv = process.argv.slice(2), io = console) {
  const [domainExportDir, archetypeId] = argv;
  if (!domainExportDir || !archetypeId) {
    io.error('Usage: npm run rebuild -- <domain-export-dir> <archetypeId>');
    return 1;
  }

  try {
    const manifest = await rebuildArchetype({
      domainDir: path.resolve(domainExportDir),
      archetypeId,
    });
    io.log(JSON.stringify(manifest, null, 2));
    return 0;
  } catch (error) {
    io.error(JSON.stringify({
      success: false,
      code: error?.code || 'REBUILD_FAILED',
      error: error?.message || String(error),
    }, null, 2));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  process.exitCode = await runRebuildCli();
}
