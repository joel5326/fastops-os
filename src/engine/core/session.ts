import crypto from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Message } from '../types.js';

export type SessionStatus = 'idle' | 'working' | 'waiting_on_user' | 'error' | 'closed';

export interface SessionOpts {
  sessionId?: string;
  provider: string;
  model?: string;
  maxMessages?: number;
  initialMessages?: Message[];
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

export interface SessionManagerOptions {
  persistenceDir?: string;
}

interface PersistedSession {
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
  createdAt: string;
  lastActiveAt: string;
  maxMessages: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private persistenceDir?: string;

  constructor(opts?: SessionManagerOptions) {
    this.persistenceDir = opts?.persistenceDir;
    this.hydrateFromDisk();
  }

  create(modelId: string, opts: SessionOpts): Session {
    const id = opts.sessionId || `session-${crypto.randomBytes(4).toString('hex')}`;
    const session: Session = {
      id,
      modelId,
      provider: opts.provider,
      model: opts.model ?? modelId,
      messages: opts.initialMessages ? [...opts.initialMessages] : [],
      status: 'idle',
      tokensBurned: 0,
      costAccumulated: 0,
      toolCallCount: 0,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      maxMessages: opts.maxMessages ?? 50,
    };

    this.sessions.set(id, session);
    this.persistSession(session);
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
    this.persistSession(session);
  }

  setStatus(sessionId: string, status: SessionStatus): void {
    const session = this.getOrThrow(sessionId);
    session.status = status;
    session.lastActiveAt = new Date();
    this.persistSession(session);
  }

  setTask(sessionId: string, task: string | undefined): void {
    const session = this.getOrThrow(sessionId);
    session.currentTask = task;
    session.lastActiveAt = new Date();
    this.persistSession(session);
  }

  addTokens(sessionId: string, tokens: number): void {
    const session = this.getOrThrow(sessionId);
    session.tokensBurned += tokens;
    this.persistSession(session);
  }

  addCost(sessionId: string, cost: number): void {
    const session = this.getOrThrow(sessionId);
    session.costAccumulated += cost;
    this.persistSession(session);
  }

  incrementToolCalls(sessionId: string): void {
    const session = this.getOrThrow(sessionId);
    session.toolCallCount++;
    this.persistSession(session);
  }

  close(sessionId: string): void {
    const session = this.getOrThrow(sessionId);
    session.status = 'closed';
    session.lastActiveAt = new Date();
    this.persistSession(session);
  }

  isWorking(sessionId: string): boolean {
    const session = this.get(sessionId);
    return session?.status === 'working';
  }

  private hydrateFromDisk(): void {
    if (!this.persistenceDir || !existsSync(this.persistenceDir)) {
      return;
    }

    for (const file of readdirSync(this.persistenceDir)) {
      if (!file.endsWith('.json')) continue;
      const fullPath = join(this.persistenceDir, file);
      try {
        const raw = readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(raw) as PersistedSession;
        const session: Session = {
          ...parsed,
          createdAt: new Date(parsed.createdAt),
          lastActiveAt: new Date(parsed.lastActiveAt),
        };
        this.sessions.set(session.id, session);
      } catch (e) {
        console.error(`[SessionManager] Failed to hydrate session from ${fullPath}`, e);
      }
    }
  }

  private persistSession(session: Session): void {
    if (!this.persistenceDir) return;
    if (!existsSync(this.persistenceDir)) {
      mkdirSync(this.persistenceDir, { recursive: true });
    }
    const payload: PersistedSession = {
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
    };
    const filePath = join(this.persistenceDir, `${session.id}.json`);
    writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  }
}
