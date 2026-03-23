import { estimateTokens } from '../token-counter.js';

export interface MissionState {
  id: string;
  name: string;
  status: 'open' | 'in_progress' | 'blocked' | 'complete' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low' | number | string;
  owner?: string;
  blockedBy?: string;
  progress?: number;
  lastUpdate?: string;
}

export interface MissionContext {
  text: string;
  tokens: number;
  totalMissions: number;
  activeMissions: number;
  blockedMissions: number;
}

export interface MissionLayerOpts {
  currentModelId: string;
  maxTokens?: number;
  hideCompleted?: boolean;
}

export function buildMissionLayer(
  missions: MissionState[],
  opts: MissionLayerOpts,
): MissionContext {
  if (missions.length === 0) {
    return { text: '', tokens: 0, totalMissions: 0, activeMissions: 0, blockedMissions: 0 };
  }

  let filtered = opts.hideCompleted
    ? missions.filter((m) => m.status !== 'complete' && m.status !== 'cancelled')
    : missions;

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const normPriority = (p: string | number): string => {
    if (typeof p === 'number') return ['critical', 'high', 'medium', 'low'][p - 1] ?? 'medium';
    return String(p);
  };
  filtered = [...filtered].sort((a, b) => {
    const pa = priorityOrder[normPriority(a.priority)] ?? 9;
    const pb = priorityOrder[normPriority(b.priority)] ?? 9;
    if (pa !== pb) return pa - pb;
    const statusOrder: Record<string, number> = { blocked: 0, in_progress: 1, open: 2, complete: 3, cancelled: 4 };
    return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
  });

  const parts: string[] = ['[MISSION BOARD]'];

  const blocked = filtered.filter((m) => m.status === 'blocked');
  if (blocked.length > 0) {
    parts.push('\n⚠ BLOCKED:');
    for (const m of blocked) {
      const blocker = m.blockedBy ? ` (blocked by ${m.blockedBy})` : '';
      const owner = m.owner ? ` — ${m.owner}` : '';
      parts.push(`  [${normPriority(m.priority).toUpperCase()}] ${m.name}${owner}${blocker}`);
    }
  }

  const inProgress = filtered.filter((m) => m.status === 'in_progress');
  if (inProgress.length > 0) {
    parts.push('\nIn Progress:');
    for (const m of inProgress) {
      const owner = m.owner ? ` — ${m.owner}` : '';
      const isYours = m.owner === opts.currentModelId ? ' (yours)' : '';
      const pct = m.progress != null ? ` ${Math.round(m.progress * 100)}%` : '';
      parts.push(`  [${normPriority(m.priority).toUpperCase()}] ${m.name}${owner}${isYours}${pct}`);
    }
  }

  const open = filtered.filter((m) => m.status === 'open');
  if (open.length > 0) {
    parts.push('\nOpen:');
    for (const m of open) {
      parts.push(`  [${normPriority(m.priority).toUpperCase()}] ${m.name}`);
    }
  }

  if (!opts.hideCompleted) {
    const complete = filtered.filter((m) => m.status === 'complete');
    if (complete.length > 0) {
      parts.push(`\nCompleted: ${complete.length} mission${complete.length !== 1 ? 's' : ''}`);
    }
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
    totalMissions: missions.length,
    activeMissions: inProgress.length,
    blockedMissions: blocked.length,
  };
}
