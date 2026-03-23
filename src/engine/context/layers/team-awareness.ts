import { estimateTokens } from '../token-counter.js';

export interface TeamMemberStatus {
  modelId: string;
  provider: string;
  sessionId?: string;
  status: 'online' | 'idle' | 'building' | 'qc' | 'offline' | 'compacting';
  currentTask?: string;
  phase?: string;
  lastDeliverable?: string;
  lastActiveAt?: number;
  contextUsage?: number;
  onboarded?: boolean;
}

export interface TeamAwarenessContext {
  text: string;
  tokens: number;
  memberCount: number;
  activeCount: number;
}

export interface TeamAwarenessOpts {
  currentModelId: string;
  maxTokens?: number;
  includePhase?: boolean;
  includeContextUsage?: boolean;
}

export function buildTeamAwarenessLayer(
  members: TeamMemberStatus[],
  opts: TeamAwarenessOpts,
): TeamAwarenessContext {
  if (members.length === 0) {
    return { text: '', tokens: 0, memberCount: 0, activeCount: 0 };
  }

  const parts: string[] = ['[TEAM AWARENESS]'];

  const active = members.filter((m) =>
    m.status === 'building' || m.status === 'qc' || m.status === 'online',
  );
  const idle = members.filter((m) => m.status === 'idle');
  const offline = members.filter((m) =>
    m.status === 'offline' || m.status === 'compacting',
  );

  if (active.length > 0) {
    parts.push('\nActive:');
    for (const m of active) {
      const isYou = m.modelId === opts.currentModelId ? ' (you)' : '';
      const task = m.currentTask ? ` — ${m.currentTask}` : '';
      const phase = opts.includePhase && m.phase ? ` [${m.phase}]` : '';
      const ctx = opts.includeContextUsage && m.contextUsage != null
        ? ` (${Math.round(m.contextUsage * 100)}% context)`
        : '';
      parts.push(`  ${m.modelId}${isYou}: ${m.status}${phase}${task}${ctx}`);
    }
  }

  if (idle.length > 0) {
    parts.push('\nIdle:');
    for (const m of idle) {
      const lastWork = m.lastDeliverable ? ` — last shipped: ${m.lastDeliverable}` : '';
      const ago = m.lastActiveAt
        ? ` (${formatTimeAgo(m.lastActiveAt)})`
        : '';
      parts.push(`  ${m.modelId}: idle${ago}${lastWork}`);
    }
  }

  if (offline.length > 0) {
    parts.push('\nOffline:');
    for (const m of offline) {
      const reason = m.status === 'compacting' ? ' (compacting)' : '';
      parts.push(`  ${m.modelId}${reason}`);
    }
  }

  const notOnboarded = members.filter((m) => m.onboarded === false);
  if (notOnboarded.length > 0) {
    parts.push(`\n⚠ Not onboarded: ${notOnboarded.map((m) => m.modelId).join(', ')}`);
  }

  let text = parts.join('\n');

  if (opts.maxTokens && estimateTokens(text) > opts.maxTokens) {
    const lines = text.split('\n');
    while (lines.length > 2 && estimateTokens(lines.join('\n')) > opts.maxTokens) {
      lines.pop();
    }
    text = lines.join('\n');
  }

  return {
    text,
    tokens: estimateTokens(text),
    memberCount: members.length,
    activeCount: active.length,
  };
}

function formatTimeAgo(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
