import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CompactionEventLedger,
  detectPolicyDrift,
} from '../compaction-event-ledger.js';

describe('CompactionEventLedger', () => {
  const testLogPath = path.join(__dirname, 'test-compaction-events.jsonl');

  beforeEach(() => {
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
  });

  it('appends snapshot events as JSONL', () => {
    const ledger = new CompactionEventLedger(testLogPath);
    const event = ledger.append({
      type: 'POLICY_SNAPSHOT',
      policyVersion: 1,
      policyHash: 'abc123',
    });

    expect(event.id).toContain('-');
    expect(event.ts).toBeTruthy();
    expect(fs.existsSync(testLogPath)).toBe(true);

    const lines = fs.readFileSync(testLogPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe('POLICY_SNAPSHOT');
    expect(parsed.policyVersion).toBe(1);
    expect(parsed.policyHash).toBe('abc123');
  });
});

describe('detectPolicyDrift', () => {
  it('returns false when there is no previous policy', () => {
    expect(detectPolicyDrift({
      previousPolicyHash: undefined,
      previousPolicyVersion: undefined,
      currentPolicyHash: 'new',
      currentPolicyVersion: 2,
    })).toBe(false);
  });

  it('returns true when hash changes', () => {
    expect(detectPolicyDrift({
      previousPolicyHash: 'old',
      previousPolicyVersion: 1,
      currentPolicyHash: 'new',
      currentPolicyVersion: 1,
    })).toBe(true);
  });

  it('returns true when version changes', () => {
    expect(detectPolicyDrift({
      previousPolicyHash: 'same',
      previousPolicyVersion: 1,
      currentPolicyHash: 'same',
      currentPolicyVersion: 2,
    })).toBe(true);
  });
});
