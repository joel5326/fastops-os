import { randomUUID } from 'crypto';
import type { EventBus } from '../core/event-bus.js';
import type { SessionManager, SessionOpts } from '../core/session.js';
import type { InMemoryCommsBus } from '../comms/bus.js';
import type {
  SubagentConfig,
  SubagentSession,
  SubagentSpawnResult,
  SubagentMessage,
} from './types.js';

export interface SubagentManagerDeps {
  events: EventBus;
  sessions: SessionManager;
  comms: InMemoryCommsBus;
}

export class SubagentManager {
  private subagents = new Map<string, SubagentSession>();
  private callsignIndex = new Map<string, string>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly events: EventBus;
  private readonly sessions: SessionManager;
  private readonly comms: InMemoryCommsBus;

  constructor(deps: SubagentManagerDeps) {
    this.events = deps.events;
    this.sessions = deps.sessions;
    this.comms = deps.comms;
  }

  spawn(config: SubagentConfig): SubagentSpawnResult {
    if (this.callsignIndex.has(config.callsign)) {
      const existingId = this.callsignIndex.get(config.callsign)!;
      const existing = this.subagents.get(existingId);
      if (existing && existing.lifecycle !== 'terminated') {
        throw new Error(
          `Callsign "${config.callsign}" is already in use by subagent ${existingId} (${existing.lifecycle})`,
        );
      }
    }

    const session = this.sessions.create(config.modelId, {
      model: config.modelId,
      provider: config.modelId,
    } satisfies SessionOpts);

    const id = randomUUID();
    const now = new Date().toISOString();

    const subagent: SubagentSession = {
      id,
      callsign: config.callsign,
      type: config.type,
      persistence: config.persistence,
      lifecycle: 'active',
      parentSessionId: config.parentSessionId,
      parentModelId: config.parentModelId,
      modelId: config.modelId,
      sessionId: session.id,
      productId: config.productId,
      missionId: config.missionId,
      commsChannel: config.commsChannel ?? 'general',
      spawnedAt: now,
      lastActiveAt: now,
      toolCallCount: 0,
      traceEntries: 0,
      maxIdleMs: config.maxIdleMs ?? 300_000,
    };

    this.subagents.set(id, subagent);
    this.callsignIndex.set(config.callsign, id);

    if (config.persistence === 'persistent') {
      this.startIdleTimer(id);
    }

    this.events.emit('subagent.spawned', {
      subagentId: id,
      callsign: config.callsign,
      type: config.type,
      persistence: config.persistence,
      parentModelId: config.parentModelId,
      sessionId: session.id,
    });

    this.comms.send({
      from: 'system',
      channel: subagent.commsChannel,
      content: `[SUBAGENT] ${config.callsign} (${config.type}) spawned by ${config.parentModelId}. Session: ${session.id}. Status: ACTIVE.`,
    });

    return { subagent, sessionId: session.id, callsign: config.callsign };
  }

  sendMessage(msg: SubagentMessage): boolean {
    const targetId = this.callsignIndex.get(msg.to);
    if (!targetId) return false;

    const target = this.subagents.get(targetId);
    if (!target) return false;

    if (target.lifecycle === 'terminated') return false;

    if (target.lifecycle === 'idle' && msg.type === 'wake') {
      this.wake(target.callsign);
    }

    this.comms.send({
      from: msg.from,
      channel: target.commsChannel,
      content: `[@${msg.to}] ${msg.content}`,
    });

    this.events.emit('subagent.message', {
      subagentId: targetId,
      callsign: msg.to,
      from: msg.from,
      type: msg.type,
    });

    return true;
  }

  wake(callsign: string): SubagentSession | null {
    const id = this.callsignIndex.get(callsign);
    if (!id) return null;

    const subagent = this.subagents.get(id);
    if (!subagent) return null;

    if (subagent.lifecycle === 'terminated') return null;
    if (subagent.lifecycle === 'active') return subagent;

    subagent.lifecycle = 'active';
    subagent.lastActiveAt = new Date().toISOString();
    this.resetIdleTimer(id);

    this.events.emit('subagent.woke', { subagentId: id, callsign });

    this.comms.send({
      from: 'system',
      channel: subagent.commsChannel,
      content: `[SUBAGENT] ${callsign} woke up. Status: ACTIVE.`,
    });

    return subagent;
  }

  markActive(callsign: string): void {
    const id = this.callsignIndex.get(callsign);
    if (!id) return;

    const subagent = this.subagents.get(id);
    if (!subagent || subagent.lifecycle === 'terminated') return;

    subagent.lifecycle = 'active';
    subagent.lastActiveAt = new Date().toISOString();
    subagent.toolCallCount++;
    this.resetIdleTimer(id);
  }

  recordTrace(callsign: string): void {
    const id = this.callsignIndex.get(callsign);
    if (!id) return;

    const subagent = this.subagents.get(id);
    if (!subagent) return;

    subagent.traceEntries++;
    subagent.lastActiveAt = new Date().toISOString();
  }

  goIdle(callsign: string): SubagentSession | null {
    const id = this.callsignIndex.get(callsign);
    if (!id) return null;

    const subagent = this.subagents.get(id);
    if (!subagent || subagent.lifecycle === 'terminated') return null;

    if (subagent.persistence === 'ephemeral') {
      return this.terminate(callsign);
    }

    subagent.lifecycle = 'idle';
    this.clearIdleTimer(id);
    this.events.emit('subagent.idle', { subagentId: id, callsign });

    return subagent;
  }

  terminate(callsign: string): SubagentSession | null {
    const id = this.callsignIndex.get(callsign);
    if (!id) return null;

    const subagent = this.subagents.get(id);
    if (!subagent) return null;

    if (subagent.lifecycle === 'terminated') return subagent;

    subagent.lifecycle = 'terminated';
    subagent.terminatedAt = new Date().toISOString();

    this.clearIdleTimer(id);

    try {
      this.sessions.close(subagent.sessionId);
    } catch {
      // Session may already be closed
    }

    this.events.emit('subagent.terminated', {
      subagentId: id,
      callsign,
      toolCallCount: subagent.toolCallCount,
      traceEntries: subagent.traceEntries,
    });

    this.comms.send({
      from: 'system',
      channel: subagent.commsChannel,
      content: `[SUBAGENT] ${callsign} terminated. Tool calls: ${subagent.toolCallCount}. Traces: ${subagent.traceEntries}.`,
    });

    return subagent;
  }

  getByCallsign(callsign: string): SubagentSession | undefined {
    const id = this.callsignIndex.get(callsign);
    return id ? this.subagents.get(id) : undefined;
  }

  getById(id: string): SubagentSession | undefined {
    return this.subagents.get(id);
  }

  listAll(): SubagentSession[] {
    return Array.from(this.subagents.values());
  }

  listActive(): SubagentSession[] {
    return this.listAll().filter((s) => s.lifecycle === 'active');
  }

  listByParent(parentSessionId: string): SubagentSession[] {
    return this.listAll().filter((s) => s.parentSessionId === parentSessionId);
  }

  listByProduct(productId: string): SubagentSession[] {
    return this.listAll().filter((s) => s.productId === productId);
  }

  getCallsignMap(): Map<string, SubagentSession> {
    const map = new Map<string, SubagentSession>();
    for (const [callsign, id] of this.callsignIndex) {
      const sub = this.subagents.get(id);
      if (sub && sub.lifecycle !== 'terminated') {
        map.set(callsign, sub);
      }
    }
    return map;
  }

  private startIdleTimer(id: string): void {
    const subagent = this.subagents.get(id);
    if (!subagent) return;

    const callsign = subagent.callsign;
    const timer = setTimeout(() => {
      const current = this.subagents.get(id);
      if (current && current.lifecycle === 'active') {
        this.goIdle(callsign);
      }
    }, subagent.maxIdleMs);

    this.idleTimers.set(id, timer);
  }

  private resetIdleTimer(id: string): void {
    this.clearIdleTimer(id);
    this.startIdleTimer(id);
  }

  private clearIdleTimer(id: string): void {
    const existing = this.idleTimers.get(id);
    if (existing) {
      clearTimeout(existing);
      this.idleTimers.delete(id);
    }
  }

  shutdown(): void {
    for (const [id] of this.idleTimers) {
      this.clearIdleTimer(id);
    }
    for (const subagent of this.subagents.values()) {
      if (subagent.lifecycle !== 'terminated') {
        subagent.lifecycle = 'terminated';
        subagent.terminatedAt = new Date().toISOString();
        try {
          this.sessions.close(subagent.sessionId);
        } catch (err) {
          // ignore
        }
      }
    }
  }
}
