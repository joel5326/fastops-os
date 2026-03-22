import type { Message } from '../types.js';

export type CompactionThreshold = 60 | 80 | 90 | 95;

export interface CompactionPolicy {
  checkpointThreshold: CompactionThreshold;
  summarizeThreshold: CompactionThreshold;
  handoffThreshold: CompactionThreshold;
  hardStopThreshold: CompactionThreshold;
  summaryTargetPercent: number;
}

export interface SummarizationPolicy {
  preserveRecentCount: number;
  dropToolOutputs: boolean;
  preservePatterns: RegExp[];
  urgentPatterns: RegExp[];
}

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = {
  checkpointThreshold: 60,
  summarizeThreshold: 80,
  handoffThreshold: 90,
  hardStopThreshold: 95,
  summaryTargetPercent: 0.5,
};

export const DEFAULT_SUMMARIZATION_POLICY: SummarizationPolicy = {
  preserveRecentCount: 5,
  dropToolOutputs: true,
  preservePatterns: [
    /\b(decision|commitment|committed|we decided|action item|must ship|accepted)\b/i,
    /\b(contract|qc pass|qc fail|validation|blocked)\b/i,
    /```[\s\S]*?```/,
  ],
  urgentPatterns: [/\[URGENT\]/i, /\[CRITICAL\]/i, /\bP0\b/i],
};

export function normalizeCompactionPolicy(
  policy?: Partial<CompactionPolicy>,
): CompactionPolicy {
  const merged = { ...DEFAULT_COMPACTION_POLICY, ...policy };

  if (
    merged.checkpointThreshold > merged.summarizeThreshold ||
    merged.summarizeThreshold > merged.handoffThreshold ||
    merged.handoffThreshold > merged.hardStopThreshold
  ) {
    throw new Error(
      'Invalid compaction policy: thresholds must be ordered checkpoint <= summarize <= handoff <= hardStop',
    );
  }

  if (merged.summaryTargetPercent <= 0 || merged.summaryTargetPercent >= 1) {
    throw new Error('Invalid compaction policy: summaryTargetPercent must be in (0, 1)');
  }

  return merged;
}

export function shouldPreserveVerbatim(
  message: Message,
  index: number,
  total: number,
  policy: SummarizationPolicy = DEFAULT_SUMMARIZATION_POLICY,
): { preserve: boolean; reason?: string } {
  const content = message.content || '';
  const isRecent = index >= total - policy.preserveRecentCount;
  if (isRecent) {
    if (policy.dropToolOutputs && message.role === 'tool') {
      return { preserve: false };
    }
    return { preserve: true, reason: 'recent message' };
  }

  if (policy.dropToolOutputs && message.role === 'tool') {
    return { preserve: false };
  }

  if (policy.urgentPatterns.some((rx) => rx.test(content))) {
    return { preserve: true, reason: 'urgent message' };
  }

  if (policy.preservePatterns.some((rx) => rx.test(content))) {
    return { preserve: true, reason: 'decision/commitment/code' };
  }

  return { preserve: false };
}
