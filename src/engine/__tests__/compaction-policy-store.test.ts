import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  CompactionPolicyStore,
  fingerprintPolicy,
} from '../persistence/compaction-policy-store.js';

const TEST_DIR = join(process.cwd(), '.test-compaction-policy');
const POLICY_FILE = join(TEST_DIR, 'compaction-policy.json');

describe('CompactionPolicyStore', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('creates default persisted policy with version and hash', () => {
    const store = new CompactionPolicyStore(POLICY_FILE);
    const doc = store.getDocument();

    expect(doc.version).toBe(1);
    expect(doc.policyHash).toHaveLength(64);
    expect(existsSync(POLICY_FILE)).toBe(true);
  });

  it('updates policy and increments version with new fingerprint', () => {
    const store = new CompactionPolicyStore(POLICY_FILE);
    const before = store.getDocument();
    const after = store.update({
      compactionPolicy: { summarizeThreshold: 90 },
    });

    expect(after.version).toBe(before.version + 1);
    expect(after.policyHash).not.toBe(before.policyHash);
    expect(after.compactionPolicy.summarizeThreshold).toBe(90);
  });

  it('rejects corrupted hash on load', () => {
    const store = new CompactionPolicyStore(POLICY_FILE);
    const doc = store.getDocument();
    const corrupted = { ...doc, policyHash: 'deadbeef' };
    writeFileSync(POLICY_FILE, JSON.stringify(corrupted, null, 2), 'utf8');

    expect(() => new CompactionPolicyStore(POLICY_FILE)).toThrow('hash mismatch');
  });

  it('fingerprint is deterministic for same policy', () => {
    const store = new CompactionPolicyStore(POLICY_FILE);
    const doc = JSON.parse(readFileSync(POLICY_FILE, 'utf8'));
    const hashA = fingerprintPolicy(doc.compactionPolicy, doc.summarizationPolicy);
    const hashB = fingerprintPolicy(doc.compactionPolicy, doc.summarizationPolicy);
    expect(hashA).toBe(hashB);
  });
});
