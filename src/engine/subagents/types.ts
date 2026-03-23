export type SubagentLifecycle = 'spawning' | 'active' | 'idle' | 'terminated';
export type SubagentType = 'build' | 'research' | 'qc' | 'onboard' | 'overwatch' | 'custom';
export type SubagentPersistence = 'ephemeral' | 'persistent';

export interface SubagentConfig {
  callsign: string;
  type: SubagentType;
  persistence: SubagentPersistence;
  parentSessionId: string;
  parentModelId: string;
  modelId: string;
  productId?: string;
  missionId?: string;
  commsChannel?: string;
  maxIdleMs?: number;
  contextFiles?: string[];
  includeWisdoms?: boolean;
}

export interface SubagentSession {
  id: string;
  callsign: string;
  type: SubagentType;
  persistence: SubagentPersistence;
  lifecycle: SubagentLifecycle;
  parentSessionId: string;
  parentModelId: string;
  modelId: string;
  sessionId: string;
  productId?: string;
  missionId?: string;
  commsChannel: string;
  spawnedAt: string;
  lastActiveAt: string;
  terminatedAt?: string;
  toolCallCount: number;
  traceEntries: number;
  maxIdleMs: number;
}

export interface SubagentSpawnResult {
  subagent: SubagentSession;
  sessionId: string;
  callsign: string;
}

export interface SubagentMessage {
  from: string;
  to: string;
  content: string;
  type: 'task' | 'redirect' | 'status' | 'wake' | 'terminate';
  ts: string;
}

export interface SubagentTrace {
  ts: string;
  phase: 'orient' | 'build' | 'review' | 'debrief';
  action: string;
  decision: string;
  uncertainty: string;
  next: string;
  agentId: string;
}
