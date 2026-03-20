import crypto from 'crypto';
import type { Message } from '../types.js';

export type SessionStatus = 'idle' | 'working' | 'waiting_on_user' | 'error' | 'closed';

export interface SessionOpts {
  provider: string;
  model?: string;
  maxMessages?: number;
}

export interface Session {
  id: string;
  modelId: string;
  provider: string;
  model: string;
  messages: Message[];
  status: SessionStatus;
  currentTask?: string;
  tokensBurned: number;
  costAccumulated: number;
  toolCallCount: number;
  createdAt: Date;
  lastActiveAt: Date;
  maxMessages: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();

  create(modelId: string, opts: SessionOpts): Session {
    const id = `session-${crypto.randomBytes(4).toString('hex')}`;
    const session: Session = {
      id,
      modelId,
      provider: opts.provider,
      model: opts.model ?? modelId,
      messages: [],
      status: 'idle',
      tokensBurned: 0,
      costAccumulated: 0,
      toolCallCount: 0,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      maxMessages: opts.maxMessages ?? 50,
    };

    this.sessions.set(id, session);
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getOrThrow(sessionId: string): Session {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`Session not found: ${sessionId}`);
    return s;
  }

  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  addMessage(sessionId: string, message: Message): void {
    const session = this.getOrThrow(sessionId);
    session.messages.push(message);
    session.lastActiveAt = new Date();

    if (session.messages.length > session.maxMessages) {
      session.messages = session.messages.slice(-session.maxMessages);
    }
  }

  setStatus(sessionId: string, status: SessionStatus): void {
    const session = this.getOrThrow(sessionId);
    session.status = status;
    session.lastActiveAt = new Date();
  }

  setTask(sessionId: string, task: string | undefined): void {
    const session = this.getOrThrow(sessionId);
    session.currentTask = task;
    session.lastActiveAt = new Date();
  }

  addTokens(sessionId: string, tokens: number): void {
    const session = this.getOrThrow(sessionId);
    session.tokensBurned += tokens;
  }

  addCost(sessionId: string, cost: number): void {
    const session = this.getOrThrow(sessionId);
    session.costAccumulated += cost;
  }

  incrementToolCalls(sessionId: string): void {
    const session = this.getOrThrow(sessionId);
    session.toolCallCount++;
  }

  close(sessionId: string): void {
    const session = this.getOrThrow(sessionId);
    session.status = 'closed';
    session.lastActiveAt = new Date();
  }

  isWorking(sessionId: string): boolean {
    const session = this.get(sessionId);
    return session?.status === 'working';
  }
}
