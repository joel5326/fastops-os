import { estimateTokens } from '../token-counter.js';

export interface EngineState {
  missionBoard?: Array<{ id: string; name: string; status: string; priority: string }>;
  contractBoard?: Array<{ id: string; name: string; status: string; builder?: string; qc?: string }>;
  activeRoster?: Array<{ modelId: string; provider: string; status: string; currentTask?: string }>;
}

export interface StateContext {
  text: string;
  tokens: number;
}

export function buildStateLayer(state: EngineState): StateContext {
  const parts: string[] = ['[ENGINE STATE]'];

  if (state.missionBoard?.length) {
    parts.push('\nMissions:');
    for (const m of state.missionBoard) {
      parts.push(`  ${m.id}: ${m.name} [${m.status}] (${m.priority})`);
    }
  }

  if (state.contractBoard?.length) {
    parts.push('\nContracts:');
    for (const c of state.contractBoard) {
      const assignees = [c.builder && `builder: ${c.builder}`, c.qc && `qc: ${c.qc}`].filter(Boolean).join(', ');
      parts.push(`  ${c.id}: ${c.name} [${c.status}]${assignees ? ` (${assignees})` : ''}`);
    }
  }

  if (state.activeRoster?.length) {
    parts.push('\nActive Models:');
    for (const r of state.activeRoster) {
      parts.push(`  ${r.modelId} (${r.provider}): ${r.status}${r.currentTask ? ` — working on ${r.currentTask}` : ''}`);
    }
  }

  const text = parts.join('\n');
  return { text, tokens: estimateTokens(text) };
}
