import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { SessionManager } from '../core/session.js';

const TEST_DIR = join(process.cwd(), '.test-session-persistence');
const PERSIST_DIR = join(TEST_DIR, 'sessions');

describe('SessionManager persistence', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
    if (existsSync(PERSIST_DIR)) rmSync(PERSIST_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('persists a created session and hydrates on restart', () => {
    const sm1 = new SessionManager({ persistenceDir: PERSIST_DIR });
    const created = sm1.create('gpt', {
      provider: 'openai',
      model: 'gpt-4o-mini',
      sessionId: 'session-persist-1',
      initialMessages: [{ role: 'system', content: 'resume me' }],
    });
    sm1.addMessage(created.id, { role: 'user', content: 'hello' });
    sm1.addMessage(created.id, {
      role: 'assistant',
      content: 'working',
      toolCalls: [{ id: 'tc-1', name: 'read_file', arguments: '{"path":"x"}' }],
    });

    const sm2 = new SessionManager({ persistenceDir: PERSIST_DIR });
    const hydrated = sm2.getOrThrow('session-persist-1');

    expect(hydrated.modelId).toBe('gpt');
    expect(hydrated.messages.length).toBe(3);
    expect(hydrated.messages[2].toolCalls?.[0].id).toBe('tc-1');
    expect(hydrated.createdAt instanceof Date).toBe(true);
    expect(hydrated.lastActiveAt instanceof Date).toBe(true);
  });

  it('persists session lifecycle updates', () => {
    const sm1 = new SessionManager({ persistenceDir: PERSIST_DIR });
    const created = sm1.create('claude', {
      provider: 'anthropic',
      sessionId: 'session-persist-2',
    });
    sm1.setStatus(created.id, 'working');
    sm1.setTask(created.id, 'FOS-99');
    sm1.addTokens(created.id, 123);
    sm1.addCost(created.id, 0.42);
    sm1.incrementToolCalls(created.id);
    sm1.close(created.id);

    const sm2 = new SessionManager({ persistenceDir: PERSIST_DIR });
    const hydrated = sm2.getOrThrow('session-persist-2');

    expect(hydrated.status).toBe('closed');
    expect(hydrated.currentTask).toBe('FOS-99');
    expect(hydrated.tokensBurned).toBe(123);
    expect(hydrated.costAccumulated).toBeCloseTo(0.42);
    expect(hydrated.toolCallCount).toBe(1);
  });
});
