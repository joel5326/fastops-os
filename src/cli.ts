#!/usr/bin/env node

import { loadConfig } from './config.js';
import { createEngine } from './engine/core/engine.js';
import { createApp } from './server/api.js';
import { attachWebSocket } from './server/websocket.js';
import { createServer } from 'http';
import { parseContractFile } from './engine/contracts/parser.js';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'start':
      return startEngine();
    case 'status':
      return showStatus();
    case 'chat':
      return chatOnce();
    case 'halt':
      return halt();
    case 'load-contracts':
      return loadContracts();
    default:
      printUsage();
  }
}

function printUsage() {
  console.log(`
  FastOps OS — AI SEAL Team Engine

  Usage:
    fastops start               Boot engine + server + UI
    fastops status              Show engine state, adapters, sessions
    fastops chat <model> "msg"  Send a message and print response
    fastops halt                Trigger kill switch
    fastops load-contracts <dir>  Load contract files from directory

  Environment:
    FASTOPS_PORT          Server port (default: 3100)
    ANTHROPIC_API_KEY     Anthropic adapter
    OPENAI_API_KEY        OpenAI adapter
    GEMINI_API_KEY        Google adapter
    OPENROUTER_API_KEY    OpenRouter adapter
`);
}

async function startEngine() {
  const config = loadConfig();
  const engine = createEngine(config, { workingDirectory: process.cwd() });

  await engine.start();

  const contractsDir = join(process.cwd(), 'contracts');
  if (existsSync(contractsDir)) {
    try {
      const files = readdirSync(contractsDir).filter((f) => f.endsWith('.md'));
      const contracts = files.map((f) => parseContractFile(join(contractsDir, f))).filter((c): c is NonNullable<typeof c> => c !== null);
      engine.loadContracts(contracts);
      console.log(`[FastOps OS] Loaded ${contracts.length} contracts from ${contractsDir}`);
    } catch (err) {
      console.warn(`[FastOps OS] Could not load contracts: ${err}`);
    }
  }

  const app = createApp(engine);
  const server = createServer(app);
  attachWebSocket(server, engine);

  const port = config.port;
  server.listen(port, () => {
    console.log(`
  ┌─────────────────────────────────────────────────┐
  │              FastOps OS — Running                │
  │                                                  │
  │  API:       http://localhost:${port}/api${' '.repeat(Math.max(0, 14 - String(port).length))}│
  │  WebSocket: ws://localhost:${port}/ws${' '.repeat(Math.max(0, 15 - String(port).length))}│
  │  UI:        http://localhost:3200${' '.repeat(14)}│
  │                                                  │
  │  Security:  ${config.securityTier}${' '.repeat(Math.max(0, 36 - config.securityTier.length))}│
  └─────────────────────────────────────────────────┘
`);
  });

  const shutdown = async () => {
    console.log('\n[FastOps OS] Shutting down...');
    await engine.stop();
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function showStatus() {
  const port = parseInt(process.env.FASTOPS_PORT || '3100', 10);
  try {
    const res = await fetch(`http://localhost:${port}/api/health`);
    const health = (await res.json()) as { running: boolean };

    const sessRes = await fetch(`http://localhost:${port}/api/sessions`);
    const sessions = (await sessRes.json()) as unknown[];

    const adapterRes = await fetch(`http://localhost:${port}/api/adapters`);
    const adapters = (await adapterRes.json()) as { available: string[]; models: Array<{ provider: string; model: string }> };

    const stateRes = await fetch(`http://localhost:${port}/api/state`);
    const state = (await stateRes.json()) as { halted?: boolean };

    console.log(`
  Engine: ${health.running ? 'RUNNING' : 'STOPPED'}
  Halted: ${state.halted ? 'YES' : 'no'}
  Adapters: ${adapters.available.join(', ') || 'none'}
  Sessions: ${sessions.length}
  Models: ${adapters.models.map((m) => `${m.provider}/${m.model}`).join(', ') || 'none'}
`);
  } catch {
    console.error(`  Engine not reachable at http://localhost:${port}`);
    process.exit(1);
  }
}

async function chatOnce() {
  const model = args[1];
  const message = args.slice(2).join(' ');

  if (!model || !message) {
    console.error('Usage: fastops chat <model> "message"');
    process.exit(1);
  }

  const port = parseInt(process.env.FASTOPS_PORT || '3100', 10);
  const base = `http://localhost:${port}`;

  try {
    const sessRes = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: model }),
    });
    const session = (await sessRes.json()) as { id: string; error?: string };

    if (session.error) {
      console.error(`Error: ${session.error}`);
      process.exit(1);
    }

    console.log(`[${model}] Sending: "${message}"`);
    const start = Date.now();

    const msgRes = await fetch(`${base}/api/sessions/${session.id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
    const result = (await msgRes.json()) as { content: string; usage?: { cost?: number }; toolCallCount?: number; error?: string };

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (result.error) {
      console.error(`Error: ${result.error}`);
    } else {
      console.log(`\n${result.content}\n`);
      console.log(`  Duration: ${elapsed}s · Tools: ${result.toolCallCount || 0} · Cost: $${(result.usage?.cost || 0).toFixed(4)}`);
    }

    await fetch(`${base}/api/sessions/${session.id}`, { method: 'DELETE' });
  } catch (err: any) {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function halt() {
  const port = parseInt(process.env.FASTOPS_PORT || '3100', 10);
  try {
    const res = await fetch(`http://localhost:${port}/api/kill-switch`, { method: 'POST' });
    const result = (await res.json()) as { halted: boolean };
    console.log(`Kill switch: ${result.halted ? 'ENGAGED' : 'failed'}`);
  } catch {
    console.error('Engine not reachable');
    process.exit(1);
  }
}

async function loadContracts() {
  const dir = args[1];
  if (!dir) {
    console.error('Usage: fastops load-contracts <directory>');
    process.exit(1);
  }

  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  console.log(`Found ${files.length} contract files in ${dir}`);

  for (const f of files) {
    try {
      const contract = parseContractFile(join(dir, f));
      if (!contract) { console.error(`  ✗ ${f}: could not parse`); continue; }
      console.log(`  ✓ ${contract.id}: ${contract.name} (wave ${contract.wave})`);
    } catch (err: any) {
      console.error(`  ✗ ${f}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error('[FastOps OS] Fatal:', err);
  process.exit(1);
});
