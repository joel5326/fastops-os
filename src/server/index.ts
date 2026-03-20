import { createServer } from 'http';
import { loadConfig } from '../config.js';
import { createEngine } from '../engine/core/engine.js';
import { createApp } from './api.js';
import { attachWebSocket } from './websocket.js';

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const engine = createEngine(config, {
    workingDirectory: process.cwd(),
  });

  await engine.start();

  const app = createApp(engine);
  const server = createServer(app);
  attachWebSocket(server, engine);

  const port = config.port;
  server.listen(port, () => {
    console.log(`[FastOps OS] Server running at http://localhost:${port}`);
    console.log(`[FastOps OS] API: http://localhost:${port}/api`);
    console.log(`[FastOps OS] WebSocket: ws://localhost:${port}/ws`);
    console.log(`[FastOps OS] Security tier: ${config.securityTier}`);
  });

  process.on('SIGINT', async () => {
    console.log('\n[FastOps OS] Shutting down...');
    await engine.stop();
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await engine.stop();
    server.close();
    process.exit(0);
  });
}

startServer().catch((err) => {
  console.error('[FastOps OS] Fatal:', err);
  process.exit(1);
});
