const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export interface SessionInfo {
  id: string;
  modelId: string;
  provider: string;
  status: string;
  messageCount: number;
  costAccumulated: number;
  tokensBurned: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ContractInfo {
  id: string;
  name: string;
  status: string;
  wave: number;
  claimedBy?: string;
  qcBy?: string;
  validatedBy?: string;
  dependencies: string[];
  blocks: string[];
  artifacts: string[];
}

export interface AdapterInfo {
  available: string[];
  models: Array<{ provider: string; model: string }>;
}

export interface CostLimits {
  perSessionLimit: number;
  perHourLimit: number;
  totalLimit: number;
}

export interface EngineSettings {
  securityTier: string;
  adapters: AdapterInfo;
  halted: boolean;
  costLimits: CostLimits;
  costUsage: {
    hourly: number;
    total: number;
    sessions: Record<string, number>;
  };
}

export interface TeamMember {
  modelId: string;
  status: 'active' | 'idle' | 'offline';
  onboarded: boolean;
  currentTask?: string;
  contextUsagePercent: number;
}

export interface MissionInfo {
  id: string;
  productId?: string;
  title?: string;
  name?: string;
  status: string;
  priority: string | number;
  owner?: string;
  blockedBy?: string[];
}

export interface ProductInfo {
  id: string;
  name: string;
  version?: string;
  active: boolean;
  repoPath?: string;
  missionCount?: number;
  activeMissions?: number;
}

export interface SubagentInfo {
  id: string;
  callsign: string;
  type: string;
  persistence: 'ephemeral' | 'persistent';
  lifecycle: 'spawning' | 'active' | 'idle' | 'terminated';
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

export interface CommsMessage {
  id: string;
  from: string;
  channel: string;
  content: string;
  ts: string;
}

export const apiClient = {
  health: () => api<{ status: string; running: boolean }>('/api/health'),

  listSessions: () => api<SessionInfo[]>('/api/sessions'),
  createSession: (modelId: string, model?: string) =>
    api<{ id: string; modelId: string }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ modelId, model }),
    }),
  sendMessage: (sessionId: string, content: string) =>
    api<{ content: string; usage: any; duration: number; toolCallCount: number }>(`/api/sessions/${sessionId}/message`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  getMessages: (sessionId: string) => api<ChatMessage[]>(`/api/sessions/${sessionId}/messages`),
  deleteSession: (sessionId: string) => api<void>(`/api/sessions/${sessionId}`, { method: 'DELETE' }),

  listContracts: (status?: string) => api<ContractInfo[]>(`/api/contracts${status ? `?status=${status}` : ''}`),
  getContract: (id: string) => api<ContractInfo>(`/api/contracts/${id}`),

  getAdapters: () => api<AdapterInfo>('/api/adapters'),

  getEngineSettings: () => api<EngineSettings>('/api/engine-settings'),

  updateCostLimits: (limits: Partial<CostLimits>) =>
    api<{ success: boolean; costLimits: CostLimits }>('/api/cost-limits', {
      method: 'PUT',
      body: JSON.stringify(limits),
    }),

  getComms: (channel: string, limit = 50) => api<CommsMessage[]>(`/api/comms/${channel}?limit=${limit}`),
  listChannels: () => api<{ channels: string[] }>('/api/comms'),
  sendComms: (channel: string, content: string, from?: string) =>
    api<CommsMessage>('/api/comms/send', {
      method: 'POST',
      body: JSON.stringify({ channel, content, from }),
    }),

  getState: () => api<any>('/api/state'),
  getTeam: () => api<{ team: TeamMember[] }>('/api/team'),
  getMissions: () => api<MissionInfo[]>('/api/missions'),
  getProducts: () => api<ProductInfo[]>('/api/products'),
  getSubagents: () => api<SubagentInfo[]>('/api/subagents'),
  getActiveSubagents: () => api<SubagentInfo[]>('/api/subagents/active'),
  killSwitch: () => api<{ halted: boolean }>('/api/kill-switch', { method: 'POST' }),
  releaseKillSwitch: () => api<{ halted: boolean }>('/api/kill-switch', { method: 'DELETE' }),
};

export async function streamMessage(
  sessionId: string,
  content: string,
  onChunk: (text: string) => void,
  onDone: (result: any) => void,
  onError?: (err: Error) => void,
): Promise<void> {
  try {
    const res = await fetch(`${BASE}/api/sessions/${sessionId}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!res.ok || !res.body) {
      const result = await apiClient.sendMessage(sessionId, content);
      onChunk(result.content);
      onDone(result);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') continue;
        try {
          const event = JSON.parse(raw);
          if (event.type === 'delta' && event.delta) {
            onChunk(event.delta);
          } else if (event.type === 'complete') {
            onDone(event);
          }
        } catch {}
      }
    }
  } catch (err: any) {
    if (onError) onError(err);
    else {
      const result = await apiClient.sendMessage(sessionId, content);
      onChunk(result.content);
      onDone(result);
    }
  }
}
