import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { FastOpsEngine } from '../core/engine.js';
import type { Contract } from '../contracts/types.js';

const TEST_DIR = join(process.cwd(), '.test-onboarding-gate');

function makeContract(id: string): Contract {
  return {
    id,
    name: `Contract ${id}`,
    status: 'OPEN',
    wave: 1,
    dependencies: [],
    blocks: [],
    spec: 'test spec',
    acceptanceCriteria: ['ac-1'],
    artifacts: [],
    auditTrail: [],
    claimTimeoutMs: 20 * 60 * 1000,
  };
}

describe('Onboarding governance gate', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('blocks contract claim before onboarding is completed', () => {
    const engine = new FastOpsEngine(
      { port: 3100, securityTier: 'development', adapters: {} },
      { workingDirectory: TEST_DIR },
    );
    engine.loadContracts([makeContract('FOS-TEST-01')]);

    const result = engine.claimContract('FOS-TEST-01', 'gpt');

    expect(result.success).toBe(false);
    expect(result.reason).toContain('ONBOARDING-GATE-001');
  });

  it('allows contract claim after /onboard completion', () => {
    const engine = new FastOpsEngine(
      { port: 3100, securityTier: 'development', adapters: {} },
      { workingDirectory: TEST_DIR },
    );
    engine.loadContracts([makeContract('FOS-TEST-02')]);

    engine.completeOnboarding('gpt');
    const result = engine.claimContract('FOS-TEST-02', 'gpt');

    expect(result.success).toBe(true);
    expect(result.claimedBy).toBe('gpt');
  });
});
