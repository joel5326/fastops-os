import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../core/event-bus.js';
import { StateStore } from '../core/state-store.js';
import { SessionManager } from '../core/session.js';
import { ToolExecutor } from '../tools/executor.js';
import { join } from 'path';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';

const TEST_STATE_DIR = join(process.cwd(), '.test-state');
const TEST_STATE_FILE = join(TEST_STATE_DIR, 'test-state.json');

describe('EventBus', () => {
  it('emits and receives events', () => {
    const bus = new EventBus();
    const received: unknown[] = [];
    bus.on('test', (data) => received.push(data));
    bus.emit('test', { value: 42 });
    expect(received).toEqual([{ value: 42 }]);
  });

  it('supports multiple handlers', () => {
    const bus = new EventBus();
    let count = 0;
    bus.on('test', () => count++);
    bus.on('test', () => count++);
    bus.emit('test');
    expect(count).toBe(2);
  });

  it('unsubscribes correctly', () => {
    const bus = new EventBus();
    let count = 0;
    const unsub = bus.on('test', () => count++);
    bus.emit('test');
    unsub();
    bus.emit('test');
    expect(count).toBe(1);
  });

  it('handler errors do not break the bus', () => {
    const bus = new EventBus();
    let secondCalled = false;
    bus.on('test', () => { throw new Error('oops'); });
    bus.on('test', () => { secondCalled = true; });
    bus.emit('test');
    expect(secondCalled).toBe(true);
  });
});

describe('StateStore', () => {
  beforeEach(() => {
    if (!existsSync(TEST_STATE_DIR)) mkdirSync(TEST_STATE_DIR, { recursive: true });
    if (existsSync(TEST_STATE_FILE)) unlinkSync(TEST_STATE_FILE);
  });

  afterEach(() => {
    if (existsSync(TEST_STATE_DIR)) rmSync(TEST_STATE_DIR, { recursive: true, force: true });
  });

  it('creates default state if file does not exist', () => {
    const store = new StateStore(TEST_STATE_FILE, 0);
    const state = store.get();
    expect(state.missions).toEqual([]);
    expect(state.contracts).toEqual([]);
    expect(state.halt).toBe(false);
    store.destroy();
  });

  it('persists state to disk', () => {
    const store = new StateStore(TEST_STATE_FILE, 0);
    store.update({ halt: true });
    store.persistNow();

    const store2 = new StateStore(TEST_STATE_FILE, 0);
    expect(store2.get().halt).toBe(true);
    store.destroy();
    store2.destroy();
  });

  it('tracks todos per session', () => {
    const store = new StateStore(TEST_STATE_FILE, 0);
    store.setTodos('session-1', [
      { id: 'todo-1', content: 'Build FOS-01', status: 'completed', createdAt: new Date().toISOString() },
      { id: 'todo-2', content: 'Build FOS-02', status: 'in_progress', createdAt: new Date().toISOString() },
    ]);

    const todos = store.getTodos('session-1');
    expect(todos).toHaveLength(2);
    expect(todos[0].status).toBe('completed');

    const all = store.getAllTodos();
    expect(Object.keys(all)).toContain('session-1');
    store.destroy();
  });

  it('tracks cost per session', () => {
    const store = new StateStore(TEST_STATE_FILE, 0);
    store.addCost('session-1', 0.05);
    store.addCost('session-1', 0.03);
    store.addCost('session-2', 0.10);

    const state = store.get();
    expect(state.sessionCosts['session-1']).toBeCloseTo(0.08);
    expect(state.sessionCosts['session-2']).toBeCloseTo(0.10);
    expect(state.totalCost).toBeCloseTo(0.18);
    store.destroy();
  });

  it('limits todos to 50 per session', () => {
    const store = new StateStore(TEST_STATE_FILE, 0);
    const manyTodos = Array.from({ length: 60 }, (_, i) => ({
      id: `todo-${i}`,
      content: `Task ${i}`,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    }));

    store.setTodos('session-1', manyTodos);
    expect(store.getTodos('session-1')).toHaveLength(50);
    store.destroy();
  });
});

describe('SessionManager', () => {
  let sm: SessionManager;

  beforeEach(() => {
    sm = new SessionManager();
  });

  it('creates session with unique ID', () => {
    const s1 = sm.create('claude', { provider: 'anthropic' });
    const s2 = sm.create('gpt', { provider: 'openai' });
    expect(s1.id).not.toBe(s2.id);
    expect(s1.modelId).toBe('claude');
    expect(s1.status).toBe('idle');
  });

  it('tracks messages and trims to max', () => {
    const s = sm.create('claude', { provider: 'anthropic', maxMessages: 5 });
    for (let i = 0; i < 10; i++) {
      sm.addMessage(s.id, { role: 'user', content: `msg${i}` });
    }
    expect(s.messages).toHaveLength(5);
    expect(s.messages[0].content).toBe('msg5');
  });

  it('tracks status transitions', () => {
    const s = sm.create('claude', { provider: 'anthropic' });
    expect(s.status).toBe('idle');
    sm.setStatus(s.id, 'working');
    expect(s.status).toBe('working');
    sm.setStatus(s.id, 'idle');
    expect(s.status).toBe('idle');
  });

  it('throws on access to non-existent session', () => {
    expect(() => sm.getOrThrow('fake-id')).toThrow();
  });

  it('prevents concurrent dispatch via isWorking()', () => {
    const s = sm.create('claude', { provider: 'anthropic' });
    sm.setStatus(s.id, 'working');
    expect(sm.isWorking(s.id)).toBe(true);
  });
});

describe('ToolExecutor', () => {
  it('registers and executes tools', async () => {
    const executor = new ToolExecutor();
    executor.register(
      { name: 'echo', description: 'echoes input', parameters: {} },
      async (args) => `echo: ${args.text}`,
    );

    const result = await executor.execute(
      { id: '1', name: 'echo', arguments: '{"text":"hello"}' },
      { sessionId: 's1', modelId: 'claude', workingDirectory: '.' },
    );

    expect(result.isError).toBe(false);
    expect(result.output).toBe('echo: hello');
  });

  it('returns error for unknown tool', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute(
      { id: '1', name: 'fake_tool', arguments: '{}' },
      { sessionId: 's1', modelId: 'claude', workingDirectory: '.' },
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain('Unknown tool');
  });

  it('enforces permissions', async () => {
    const executor = new ToolExecutor();
    executor.register(
      { name: 'write', description: 'writes', parameters: {} },
      async () => 'written',
    );

    executor.setPermissions('gemini', ['read']);

    const result = await executor.execute(
      { id: '1', name: 'write', arguments: '{}' },
      { sessionId: 's1', modelId: 'gemini', workingDirectory: '.' },
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain('Permission denied');
  });

  it('getDefinitions filters by model permissions', () => {
    const executor = new ToolExecutor();
    executor.register({ name: 'read', description: 'reads', parameters: {} }, async () => '');
    executor.register({ name: 'write', description: 'writes', parameters: {} }, async () => '');
    executor.register({ name: 'bash', description: 'bash', parameters: {} }, async () => '');

    executor.setPermissions('gemini', ['read']);

    expect(executor.getDefinitions('gemini')).toHaveLength(1);
    expect(executor.getDefinitions('claude')).toHaveLength(3);
    expect(executor.getDefinitions()).toHaveLength(3);
  });
});
