import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { loadConfig } from '../../config.js';
import { createEngine, type FastOpsEngine } from '../core/engine.js';
import { createApp } from '../../server/api.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import type { Contract } from '../contracts/types.js';

/**
 * API Integration Tests
 *
 * Tests the full HTTP API surface: contract lifecycle, comms,
 * cost limits, kill switch, sessions, and team endpoints.
 *
 * These run against a real express server on a random port
 * without requiring LLM API keys.
 */

const TEST_DIR = join(process.cwd(), '.test-api-integration');

let server: Server;
let engine: FastOpsEngine;
let baseUrl: string;

async function api(path: string, opts?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
}

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'API-TEST-01',
    name: 'API Test Contract',
    status: 'OPEN',
    wave: 1,
    dependencies: [],
    blocks: [],
    spec: 'Test spec for API integration',
    acceptanceCriteria: ['AC-1: Tests pass', 'AC-2: Coverage met'],
    artifacts: [],
    auditTrail: [],
    claimTimeoutMs: 20 * 60 * 1000,
    ...overrides,
  };
}

beforeAll(async () => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });

  const config = loadConfig();
  engine = createEngine(config, {
    workingDirectory: TEST_DIR,
    stateFilePath: join(TEST_DIR, 'state.json'),
    contractsStatePath: join(TEST_DIR, 'contracts.json'),
    commsExportDir: join(TEST_DIR, 'comms'),
  });

  await engine.start();

  const app = createApp(engine);
  server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await engine.stop();
  server.close();
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Health', () => {
  it('GET /health returns ok', async () => {
    const res = await api('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.running).toBe(true);
  });
});

describe('Sessions CRUD', () => {
  it('POST /sessions creates a session', async () => {
    const available = engine['registry'].listAvailable();
    const modelId = available[0];
    const res = await api('/sessions', {
      method: 'POST',
      body: JSON.stringify({ modelId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.modelId).toBe(modelId);
  });

  it('POST /sessions rejects without modelId', async () => {
    const res = await api('/sessions', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('modelId');
  });

  it('GET /sessions lists sessions', async () => {
    const available = engine['registry'].listAvailable();
    await api('/sessions', {
      method: 'POST',
      body: JSON.stringify({ modelId: available[0] }),
    });
    const res = await api('/sessions');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /sessions/:id/messages returns messages', async () => {
    const available = engine['registry'].listAvailable();
    const createRes = await api('/sessions', {
      method: 'POST',
      body: JSON.stringify({ modelId: available[0] }),
    });
    const session = await createRes.json();

    const res = await api(`/sessions/${session.id}/messages`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /sessions/:id/messages returns 404 for unknown session', async () => {
    const res = await api('/sessions/nonexistent/messages');
    expect(res.status).toBe(404);
  });

  it('DELETE /sessions/:id closes a session', async () => {
    const available = engine['registry'].listAvailable();
    const createRes = await api('/sessions', {
      method: 'POST',
      body: JSON.stringify({ modelId: available[0] }),
    });
    const session = await createRes.json();

    const res = await api(`/sessions/${session.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('DELETE /sessions/:id returns 404 for unknown session', async () => {
    const res = await api('/sessions/nonexistent', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('Comms', () => {
  it('POST /comms/send sends a message', async () => {
    const res = await api('/comms/send', {
      method: 'POST',
      body: JSON.stringify({ content: 'test message from API', channel: 'general' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe('test message from API');
    expect(body.channel).toBe('general');
  });

  it('POST /comms/send rejects without content', async () => {
    const res = await api('/comms/send', {
      method: 'POST',
      body: JSON.stringify({ channel: 'general' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /comms/:channel returns messages', async () => {
    // Send a message first
    await api('/comms/send', {
      method: 'POST',
      body: JSON.stringify({ content: 'channel test', channel: 'test-channel' }),
    });

    const res = await api('/comms/test-channel');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body.some((m: { content: string }) => m.content === 'channel test')).toBe(true);
  });

  it('GET /comms lists channels', async () => {
    const res = await api('/comms');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.channels).toBeDefined();
    expect(Array.isArray(body.channels)).toBe(true);
  });
});

describe('Contract Lifecycle via API', () => {
  it('GET /contracts returns empty list initially', async () => {
    const res = await api('/contracts');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('full lifecycle: claim -> start -> built -> QC pass -> done', async () => {
    engine.onboarding.markModelOnboarded('claude');
    engine.onboarding.markModelOnboarded('gpt');
    engine.onboarding.markModelOnboarded('gemini');

    engine.contracts.loadContracts([
      makeContract({ id: 'LIFECYCLE-01' }),
    ]);

    const claimRes = await api('/contracts/LIFECYCLE-01/claim', {
      method: 'POST',
      body: JSON.stringify({ modelId: 'claude' }),
    });
    expect(claimRes.status).toBe(200);
    const claimBody = await claimRes.json();
    expect(claimBody.success).toBe(true);

    const startRes = await api('/contracts/LIFECYCLE-01/start', {
      method: 'POST',
      body: JSON.stringify({ modelId: 'claude' }),
    });
    expect(startRes.status).toBe(200);

    const builtRes = await api('/contracts/LIFECYCLE-01/built', {
      method: 'POST',
      body: JSON.stringify({ modelId: 'claude', artifacts: ['src/test.ts'] }),
    });
    expect(builtRes.status).toBe(200);

    const qcAssignRes = await api('/contracts/LIFECYCLE-01/assign-qc', {
      method: 'POST',
      body: JSON.stringify({ availableModels: ['claude', 'gpt', 'gemini'] }),
    });
    expect(qcAssignRes.status).toBe(200);
    const qcAssign = await qcAssignRes.json();
    expect(qcAssign.assignedTo).not.toBe('claude');

    const qcRes = await api('/contracts/LIFECYCLE-01/qc', {
      method: 'POST',
      body: JSON.stringify({
        pass: true,
        findings: ['All acceptance criteria met'],
        model: qcAssign.assignedTo,
      }),
    });
    expect(qcRes.status).toBe(200);

    const contractRes = await api('/contracts/LIFECYCLE-01');
    expect(contractRes.status).toBe(200);
    const contract = await contractRes.json();
    expect(contract.status).toBe('QC_PASS');
  });

  it('double claim returns 409', async () => {
    engine.onboarding.markModelOnboarded('claude');
    engine.onboarding.markModelOnboarded('gpt');

    engine.contracts.loadContracts([
      makeContract({ id: 'DOUBLE-CLAIM-01' }),
    ]);

    await api('/contracts/DOUBLE-CLAIM-01/claim', {
      method: 'POST',
      body: JSON.stringify({ modelId: 'claude' }),
    });

    const res = await api('/contracts/DOUBLE-CLAIM-01/claim', {
      method: 'POST',
      body: JSON.stringify({ modelId: 'gpt' }),
    });
    expect(res.status).toBe(409);
  });

  it('QC failure sends contract back to IN_PROGRESS', async () => {
    engine.onboarding.markModelOnboarded('claude');
    engine.onboarding.markModelOnboarded('gpt');

    engine.contracts.loadContracts([
      makeContract({ id: 'QC-FAIL-01' }),
    ]);

    await api('/contracts/QC-FAIL-01/claim', {
      method: 'POST',
      body: JSON.stringify({ modelId: 'claude' }),
    });
    await api('/contracts/QC-FAIL-01/start', {
      method: 'POST',
      body: JSON.stringify({ modelId: 'claude' }),
    });
    await api('/contracts/QC-FAIL-01/built', {
      method: 'POST',
      body: JSON.stringify({ modelId: 'claude', artifacts: ['src/test.ts'] }),
    });
    await api('/contracts/QC-FAIL-01/assign-qc', {
      method: 'POST',
      body: JSON.stringify({ availableModels: ['claude', 'gpt'] }),
    });

    const qcRes = await api('/contracts/QC-FAIL-01/qc', {
      method: 'POST',
      body: JSON.stringify({
        pass: false,
        findings: ['Reviewed code'],
        failures: ['Missing error handling'],
        model: 'gpt',
      }),
    });
    expect(qcRes.status).toBe(200);

    const contractRes = await api('/contracts/QC-FAIL-01');
    const contract = await contractRes.json();
    expect(contract.status).toBe('IN_PROGRESS');
  });

  it('GET /contracts/:id/audit returns audit trail', async () => {
    const res = await api('/contracts/LIFECYCLE-01/audit');
    expect(res.status).toBe(200);
    const trail = await res.json();
    expect(Array.isArray(trail)).toBe(true);
    expect(trail.length).toBeGreaterThanOrEqual(3);
  });

  it('GET /contracts/ready returns unblocked contracts', async () => {
    const res = await api('/contracts/ready');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /contracts/blocked returns blocked contracts', async () => {
    const res = await api('/contracts/blocked');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /contracts/:id returns 404 for unknown contract', async () => {
    const res = await api('/contracts/NONEXISTENT');
    expect(res.status).toBe(404);
  });
});

describe('Cost Limits', () => {
  it('PUT /cost-limits sets limits', async () => {
    const res = await api('/cost-limits', {
      method: 'PUT',
      body: JSON.stringify({ perSessionLimit: 5.0, perHourLimit: 10.0, totalLimit: 50.0 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.costLimits).toBeDefined();
  });

  it('PUT /cost-limits rejects negative values', async () => {
    const res = await api('/cost-limits', {
      method: 'PUT',
      body: JSON.stringify({ perSessionLimit: -1 }),
    });
    expect(res.status).toBe(400);
  });

  it('PUT /cost-limits rejects empty body', async () => {
    const res = await api('/cost-limits', {
      method: 'PUT',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('GET /engine-settings includes cost data', async () => {
    const res = await api('/engine-settings');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.securityTier).toBeDefined();
    expect(body.costLimits).toBeDefined();
    expect(body.costUsage).toBeDefined();
  });
});

describe('Kill Switch', () => {
  it('POST /kill-switch halts the engine', async () => {
    const res = await api('/kill-switch', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.halted).toBe(true);

    // Verify state
    const stateRes = await api('/state');
    const state = await stateRes.json();
    expect(state.halt).toBe(true);
  });

  it('DELETE /kill-switch resumes the engine', async () => {
    const res = await api('/kill-switch', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.halted).toBe(false);

    // Verify state
    const stateRes = await api('/state');
    const state = await stateRes.json();
    expect(state.halt).toBe(false);
  });
});

describe('Team & Missions Context', () => {
  it('GET /team returns team info', async () => {
    const res = await api('/team');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('PUT /team updates team members', async () => {
    const res = await api('/team', {
      method: 'PUT',
      body: JSON.stringify({
        members: [
          { modelId: 'claude', role: 'builder' },
          { modelId: 'gpt', role: 'qc' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);
  });

  it('PUT /team rejects non-array', async () => {
    const res = await api('/team', {
      method: 'PUT',
      body: JSON.stringify({ members: 'not-an-array' }),
    });
    expect(res.status).toBe(400);
  });

  it('PUT /missions updates missions', async () => {
    const res = await api('/missions', {
      method: 'PUT',
      body: JSON.stringify({
        missions: [
          { id: 'test-mission', name: 'Test Mission', status: 'active' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('PUT /missions rejects non-array', async () => {
    const res = await api('/missions', {
      method: 'PUT',
      body: JSON.stringify({ missions: 'not-an-array' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('Adapters', () => {
  it('GET /adapters returns adapter info', async () => {
    const res = await api('/adapters');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBeDefined();
    expect(body.models).toBeDefined();
    expect(Array.isArray(body.available)).toBe(true);
    expect(Array.isArray(body.models)).toBe(true);
  });
});

describe('State', () => {
  it('GET /state returns engine state', async () => {
    const res = await api('/state');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.halt).toBe('boolean');
  });
});

describe('Onboarding', () => {
  it('GET /onboarding/config returns config', async () => {
    const res = await api('/onboarding/config');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.enabled).toBe('boolean');
  });

  it('GET /onboarding/triggers returns trigger history', async () => {
    const res = await api('/onboarding/triggers');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /onboarding/status/:sessionId returns 404 for unknown session', async () => {
    const res = await api('/onboarding/status/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /onboard rejects without modelId', async () => {
    const res = await api('/onboard', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('Compaction', () => {
  it('GET /compaction/alerts returns alerts array', async () => {
    const res = await api('/compaction/alerts');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /compaction/alerts/:modelId returns 404 for unknown model', async () => {
    const res = await api('/compaction/alerts/nonexistent');
    expect(res.status).toBe(404);
  });
});
