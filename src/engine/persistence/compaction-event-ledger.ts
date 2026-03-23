import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import crypto from 'crypto';

export type CompactionLedgerEventType =
  | 'POLICY_SNAPSHOT'
  | 'POLICY_DRIFT';

export interface CompactionLedgerEvent {
  id: string;
  ts: string;
  type: CompactionLedgerEventType;
  sessionId?: string;
  policyVersion?: number;
  policyHash?: string;
  previousPolicyVersion?: number;
  previousPolicyHash?: string;
  details?: Record<string, unknown>;
}

export interface PolicyDriftCheckInput {
  previousPolicyHash?: string;
  previousPolicyVersion?: number;
  currentPolicyHash: string;
  currentPolicyVersion: number;
}

export function detectPolicyDrift(input: PolicyDriftCheckInput): boolean {
  if (!input.previousPolicyHash || !input.previousPolicyVersion) return false;
  return (
    input.previousPolicyHash !== input.currentPolicyHash ||
    input.previousPolicyVersion !== input.currentPolicyVersion
  );
}

export class CompactionEventLedger {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  append(event: Omit<CompactionLedgerEvent, 'id' | 'ts'>): CompactionLedgerEvent {
    const full: CompactionLedgerEvent = {
      ...event,
      id: `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      ts: new Date().toISOString(),
    };
    appendFileSync(this.filePath, JSON.stringify(full) + '\n', 'utf8');
    return full;
  }
}
