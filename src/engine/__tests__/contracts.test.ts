import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContractEngine } from '../contracts/engine.js';
import { isValidTransition } from '../contracts/lifecycle.js';
import { areDependenciesMet, detectCircularDependencies } from '../contracts/dependency.js';
import { assignQC, assignValidator } from '../contracts/assignment.js';
import type { Contract } from '../contracts/types.js';
import { join } from 'path';
import { existsSync, rmSync, mkdirSync } from 'fs';

const TEST_DIR = join(process.cwd(), '.test-contracts');
const STATE_FILE = join(TEST_DIR, 'contracts.json');

function makeContract(overrides: Partial<Contract>): Contract {
  return {
    id: 'TEST-01',
    name: 'Test Contract',
    status: 'OPEN',
    wave: 1,
    dependencies: [],
    blocks: [],
    spec: 'Test spec',
    acceptanceCriteria: ['AC-1', 'AC-2'],
    artifacts: [],
    auditTrail: [],
    claimTimeoutMs: 20 * 60 * 1000,
    ...overrides,
  };
}

describe('Lifecycle State Machine', () => {
  it('allows valid transitions', () => {
    expect(isValidTransition('OPEN', 'CLAIMED')).toBe(true);
    expect(isValidTransition('CLAIMED', 'IN_PROGRESS')).toBe(true);
    expect(isValidTransition('IN_PROGRESS', 'BUILT')).toBe(true);
    expect(isValidTransition('BUILT', 'QC_REVIEW')).toBe(true);
    expect(isValidTransition('QC_REVIEW', 'QC_PASS')).toBe(true);
    expect(isValidTransition('QC_REVIEW', 'QC_FAIL')).toBe(true);
    expect(isValidTransition('QC_PASS', 'DONE')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(isValidTransition('OPEN', 'DONE')).toBe(false);
    expect(isValidTransition('BUILT', 'DONE')).toBe(false);
    expect(isValidTransition('DONE', 'OPEN')).toBe(false);
  });

  it('enforces BUILT must go through QC_REVIEW (no bypass to DONE)', () => {
    expect(isValidTransition('BUILT', 'DONE')).toBe(false);
    expect(isValidTransition('BUILT', 'QC_REVIEW')).toBe(true);
  });
});

describe('Dependency Resolution', () => {
  it('returns true when no dependencies', () => {
    const c = makeContract({});
    expect(areDependenciesMet(c, [])).toBe(true);
  });

  it('returns false when dependency is not DONE', () => {
    const dep = makeContract({ id: 'FOS-01', status: 'IN_PROGRESS' });
    const c = makeContract({ id: 'FOS-02', dependencies: ['FOS-01'] });
    expect(areDependenciesMet(c, [dep])).toBe(false);
  });

  it('returns true when dependency is DONE', () => {
    const dep = makeContract({ id: 'FOS-01', status: 'DONE' });
    const c = makeContract({ id: 'FOS-02', dependencies: ['FOS-01'] });
    expect(areDependenciesMet(c, [dep, c])).toBe(true);
  });

  it('detects circular dependencies', () => {
    const a = makeContract({ id: 'A', dependencies: ['B'] });
    const b = makeContract({ id: 'B', dependencies: ['A'] });
    const cycles = detectCircularDependencies([a, b]);
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe('Assignment Logic', () => {
  it('assigns QC to different model than builder', () => {
    const c = makeContract({ claimedBy: 'claude' });
    const qc = assignQC(c, ['claude', 'gpt', 'gemini'], new Map());
    expect(qc).not.toBe('claude');
  });

  it('prefers cross-architecture for QC', () => {
    const c = makeContract({ claimedBy: 'claude' });
    const qc = assignQC(c, ['haiku', 'gpt', 'gemini'], new Map());
    expect(qc).not.toBe('haiku');
  });

  it('assigns validator different from builder AND QC', () => {
    const c = makeContract({ claimedBy: 'claude', qcBy: 'gpt' });
    const validator = assignValidator(c, ['claude', 'gpt', 'gemini', 'kimi'], new Map());
    expect(validator).not.toBe('claude');
    expect(validator).not.toBe('gpt');
  });

  it('load balances assignments', () => {
    const c = makeContract({ claimedBy: 'claude' });
    const loads = new Map([['gpt', 5], ['gemini', 1]]);
    const qc = assignQC(c, ['gpt', 'gemini'], loads);
    expect(qc).toBe('gemini');
  });
});

describe('ContractEngine', () => {
  let engine: ContractEngine;

  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
    engine = new ContractEngine(STATE_FILE);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('loads contracts and lists them', () => {
    engine.loadContracts([
      makeContract({ id: 'FOS-01' }),
      makeContract({ id: 'FOS-02', dependencies: ['FOS-01'] }),
    ]);

    expect(engine.listContracts()).toHaveLength(2);
    expect(engine.getReady()).toHaveLength(1);
    expect(engine.getReady()[0].id).toBe('FOS-01');
  });

  it('claim is atomic — returns success for first, failure for second', () => {
    engine.loadContracts([makeContract({ id: 'FOS-01' })]);

    const r1 = engine.claim('FOS-01', 'claude');
    expect(r1.success).toBe(true);

    const r2 = engine.claim('FOS-01', 'gpt');
    expect(r2.success).toBe(false);
    expect(r2.reason).toContain('not OPEN');
  });

  it('enforces dependency on claim', () => {
    engine.loadContracts([
      makeContract({ id: 'FOS-01' }),
      makeContract({ id: 'FOS-02', dependencies: ['FOS-01'] }),
    ]);

    const result = engine.claim('FOS-02', 'claude');
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Unmet dependencies');
  });

  it('full lifecycle: OPEN → CLAIMED → IN_PROGRESS → BUILT → QC → DONE', () => {
    engine.loadContracts([makeContract({ id: 'FOS-01' })]);

    engine.claim('FOS-01', 'claude');
    engine.startWork('FOS-01', 'claude');
    engine.reportBuilt('FOS-01', 'claude', ['src/adapter.ts']);

    const qcAssignment = engine.assignQCModel('FOS-01', ['claude', 'gpt', 'gemini']);
    expect(qcAssignment).not.toBeNull();
    expect(qcAssignment!.assignedTo).not.toBe('claude');

    engine.reportQC('FOS-01', {
      pass: true,
      findings: ['All acceptance criteria met'],
      model: qcAssignment!.assignedTo,
    });

    const contract = engine.getContract('FOS-01');
    expect(contract!.status).toBe('QC_PASS');

    engine.markDone('FOS-01', 'system', 'QC passed, validation waived for Wave 1');
    expect(engine.getContract('FOS-01')!.status).toBe('DONE');
  });

  it('QC failure sends contract back to IN_PROGRESS', () => {
    engine.loadContracts([makeContract({ id: 'FOS-01' })]);
    engine.claim('FOS-01', 'claude');
    engine.startWork('FOS-01', 'claude');
    engine.reportBuilt('FOS-01', 'claude', ['src/adapter.ts']);
    engine.assignQCModel('FOS-01', ['claude', 'gpt']);

    engine.reportQC('FOS-01', {
      pass: false,
      findings: ['Checked type safety'],
      failures: ['Missing error handling'],
      model: 'gpt',
    });

    expect(engine.getContract('FOS-01')!.status).toBe('IN_PROGRESS');
  });

  it('audit trail captures all transitions', () => {
    engine.loadContracts([makeContract({ id: 'FOS-01' })]);
    engine.claim('FOS-01', 'claude');
    engine.startWork('FOS-01', 'claude');

    const trail = engine.getAuditTrail('FOS-01');
    expect(trail).toHaveLength(2);
    expect(trail[0].from).toBe('OPEN');
    expect(trail[0].to).toBe('CLAIMED');
    expect(trail[1].from).toBe('CLAIMED');
    expect(trail[1].to).toBe('IN_PROGRESS');
  });

  it('persists state and recovers on restart', () => {
    engine.loadContracts([makeContract({ id: 'FOS-01' })]);
    engine.claim('FOS-01', 'claude');

    const engine2 = new ContractEngine(STATE_FILE);
    const contract = engine2.getContract('FOS-01');
    expect(contract).toBeDefined();
    expect(contract!.status).toBe('CLAIMED');
    expect(contract!.claimedBy).toBe('claude');
  });

  it('rejects circular dependencies at load time', () => {
    expect(() => {
      engine.loadContracts([
        makeContract({ id: 'A', dependencies: ['B'] }),
        makeContract({ id: 'B', dependencies: ['A'] }),
      ]);
    }).toThrow('Circular');
  });

  it('validation requires evidence', () => {
    engine.loadContracts([makeContract({ id: 'FOS-01' })]);
    engine.claim('FOS-01', 'claude');
    engine.startWork('FOS-01', 'claude');
    engine.reportBuilt('FOS-01', 'claude', ['src/test.ts']);
    engine.assignQCModel('FOS-01', ['claude', 'gpt']);
    engine.reportQC('FOS-01', { pass: true, findings: ['OK'], model: 'gpt' });

    engine.assignValidatorModel('FOS-01', ['claude', 'gpt', 'gemini', 'kimi']);

    expect(() => {
      engine.reportValidation('FOS-01', { pass: true, evidence: [], model: 'gemini' });
    }).toThrow('evidence');
  });
});
