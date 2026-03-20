import { loadConfig } from './config.js';
import { AdapterRegistry } from './engine/adapters/registry.js';

async function main() {
  const config = loadConfig();
  console.log('[FastOps OS] Starting engine...');
  console.log(`[FastOps OS] Security tier: ${config.securityTier}`);
  console.log(`[FastOps OS] Port: ${config.port}`);

  const registry = new AdapterRegistry(config);
  await registry.initialize();

  const available = registry.listAvailable();
  console.log(`[FastOps OS] ${available.length} adapter(s) online: ${available.join(', ')}`);

  for (const name of available) {
    const adapter = registry.get(name);
    if (adapter) {
      const ok = await adapter.ping();
      console.log(`  ${name}: ${ok ? 'HEALTHY' : 'UNREACHABLE'}`);
    }
  }

  console.log('[FastOps OS] Engine ready.');
}

main().catch((err) => {
  console.error('[FastOps OS] Fatal:', err);
  process.exit(1);
});
