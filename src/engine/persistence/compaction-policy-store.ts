import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  DEFAULT_COMPACTION_POLICY,
  DEFAULT_SUMMARIZATION_POLICY,
  normalizeCompactionPolicy,
  type CompactionPolicy,
  type SummarizationPolicy,
} from '../context/compaction-policy.js';

export interface CompactionPolicyDocument {
  version: number;
  updatedAt: string;
  compactionPolicy: CompactionPolicy;
  summarizationPolicy: SummarizationPolicy;
  policyHash: string;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function fingerprintPolicy(
  compactionPolicy: CompactionPolicy,
  summarizationPolicy: SummarizationPolicy,
): string {
  const canonical = stableStringify({ compactionPolicy, summarizationPolicy });
  return createHash('sha256').update(canonical).digest('hex');
}

export class CompactionPolicyStore {
  private filePath: string;
  private document: CompactionPolicyDocument;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.document = this.loadOrCreate();
  }

  getDocument(): CompactionPolicyDocument {
    return this.document;
  }

  update(
    patch: {
      compactionPolicy?: Partial<CompactionPolicy>;
      summarizationPolicy?: Partial<SummarizationPolicy>;
    },
  ): CompactionPolicyDocument {
    const nextCompaction = normalizeCompactionPolicy({
      ...this.document.compactionPolicy,
      ...patch.compactionPolicy,
    });
    const nextSummarization: SummarizationPolicy = {
      ...this.document.summarizationPolicy,
      ...patch.summarizationPolicy,
    };

    this.document = {
      version: this.document.version + 1,
      updatedAt: new Date().toISOString(),
      compactionPolicy: nextCompaction,
      summarizationPolicy: nextSummarization,
      policyHash: fingerprintPolicy(nextCompaction, nextSummarization),
    };
    this.atomicWrite();
    return this.document;
  }

  private loadOrCreate(): CompactionPolicyDocument {
    if (!existsSync(this.filePath)) {
      const created = this.createDefaultDocument();
      this.document = created;
      this.atomicWrite();
      return created;
    }

    const raw = readFileSync(this.filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CompactionPolicyDocument>;
    return this.validateAndNormalize(parsed);
  }

  private createDefaultDocument(): CompactionPolicyDocument {
    const compactionPolicy = normalizeCompactionPolicy(DEFAULT_COMPACTION_POLICY);
    const summarizationPolicy = { ...DEFAULT_SUMMARIZATION_POLICY };
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      compactionPolicy,
      summarizationPolicy,
      policyHash: fingerprintPolicy(compactionPolicy, summarizationPolicy),
    };
  }

  private validateAndNormalize(
    doc: Partial<CompactionPolicyDocument>,
  ): CompactionPolicyDocument {
    if (!doc.compactionPolicy || !doc.summarizationPolicy) {
      throw new Error('Invalid compaction policy document: missing policy sections');
    }

    const compactionPolicy = normalizeCompactionPolicy(doc.compactionPolicy);
    const summarizationPolicy: SummarizationPolicy = {
      ...DEFAULT_SUMMARIZATION_POLICY,
      ...doc.summarizationPolicy,
    };
    const computedHash = fingerprintPolicy(compactionPolicy, summarizationPolicy);

    if (doc.policyHash && doc.policyHash !== computedHash) {
      throw new Error('Compaction policy hash mismatch: policy document appears corrupted');
    }

    return {
      version: Number.isInteger(doc.version) && (doc.version ?? 0) > 0 ? (doc.version as number) : 1,
      updatedAt: doc.updatedAt ?? new Date().toISOString(),
      compactionPolicy,
      summarizationPolicy,
      policyHash: computedHash,
    };
  }

  private atomicWrite(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.document, null, 2), 'utf8');
    renameSync(tmpPath, this.filePath);
  }
}
