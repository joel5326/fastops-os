import { describe, it, expect } from 'vitest';
import { Dispatcher, type DispatchStreamEvent } from '../core/dispatcher.js';
import { SessionManager } from '../core/session.js';
import { EventBus } from '../core/event-bus.js';
import { StateStore } from '../core/state-store.js';
import { ToolExecutor } from '../tools/executor.js';
import { ContextManager } from '../context/manager.js';
import type { ModelAdapter, ChatRequest, ChatResponse, ChatChunk } from '../types.js';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';

const TEST_DIR = join(process.cwd(), '.test-dispatch-stream');
const STATE_FILE = join(TEST_DIR, 'state.json');
const PROMPTS_DIR = join(TEST_DIR, 'prompts');

function makeMockAdapter(chunks: string[]): ModelAdapter {
  return {
    provider: 'mock',
    models: ['mock-model'],
    async chat(_req: ChatRequest): Promise<ChatResponse> {
      return {
        content: chunks.join(''),
        usage: { inputTokens: 10, outputTokens: 20, cost: 0.001 },
        model: 'mock-model',
        provider: 'mock',
        latencyMs: 50,
      };
    },
    async *chatStream(_req: ChatRequest): AsyncIterable<ChatChunk> {
      for (const chunk of chunks) {
        yield { delta: chunk, done: false };
      }
      yield { delta: '', done: true };
    },
    async ping(): Promise<boolean> {
      return true;
    },
  };
}

function makeMockRegistry(adapter: ModelAdapter) {
  return {
    getOrThrow(_name: string) {
      return adapter;
    },
    get(_name: string) {
      return adapter;
    },
    listAvailable() {
      return ['mock'];
    },
    listAllModels() {
      return [{ provider: 'mock', model: 'mock-model' }];
    },
    async initialize() {},
  } as any;
}

describe('Dispatcher.dispatchStream', () => {
  function setup(chunks: string[]) {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
    if (!existsSync(PROMPTS_DIR)) mkdirSync(PROMPTS_DIR, { recursive: true });

    const adapter = makeMockAdapter(chunks);
    const registry = makeMockRegistry(adapter);
    const sessions = new SessionManager();
    const events = new EventBus();
    const stateStore = new StateStore(STATE_FILE);
    stateStore.hydrate();
    const tools = new ToolExecutor();
    const contextManager = new ContextManager(PROMPTS_DIR);

    const dispatcher = new Dispatcher(
      registry,
      contextManager,
      sessions,
      tools,
      events,
      stateStore,
      { workingDirectory: TEST_DIR },
    );

    const session = sessions.create('mock', { provider: 'mock', model: 'mock-model' });

    return { dispatcher, session, sessions, events };
  }

  function cleanup() {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  }

  it('yields delta events for each chunk', async () => {
    const { dispatcher, session } = setup(['Hello', ' world', '!']);
    try {
      const events: DispatchStreamEvent[] = [];
      for await (const event of dispatcher.dispatchStream(session.id, {
        type: 'freeform',
        prompt: 'Say hello',
      })) {
        events.push(event);
      }

      const deltas = events.filter((e) => e.type === 'delta' && !e.done);
      expect(deltas).toHaveLength(3);
      expect((deltas[0] as any).delta).toBe('Hello');
      expect((deltas[1] as any).delta).toBe(' world');
      expect((deltas[2] as any).delta).toBe('!');

      const doneEvents = events.filter((e) => e.type === 'delta' && e.done);
      expect(doneEvents).toHaveLength(1);

      const completeEvents = events.filter((e) => e.type === 'complete');
      expect(completeEvents).toHaveLength(1);
      expect((completeEvents[0] as any).sessionId).toBe(session.id);
    } finally {
      cleanup();
    }
  });

  it('persists the streamed content as a message', async () => {
    const { dispatcher, session, sessions } = setup(['Streamed', ' response']);
    try {
      for await (const _event of dispatcher.dispatchStream(session.id, {
        type: 'freeform',
        prompt: 'Test persistence',
      })) {
        // consume
      }

      const s = sessions.getOrThrow(session.id);
      // Should have: user message + assistant message
      const assistantMsgs = s.messages.filter((m) => m.role === 'assistant');
      expect(assistantMsgs).toHaveLength(1);
      expect(assistantMsgs[0].content).toBe('Streamed response');
    } finally {
      cleanup();
    }
  });

  it('sets session status back to idle after streaming', async () => {
    const { dispatcher, session, sessions } = setup(['Done']);
    try {
      for await (const _event of dispatcher.dispatchStream(session.id, {
        type: 'freeform',
        prompt: 'Check status',
      })) {
        // consume
      }

      const s = sessions.getOrThrow(session.id);
      expect(s.status).toBe('idle');
    } finally {
      cleanup();
    }
  });

  it('emits task.dispatched event', async () => {
    const { dispatcher, session, events } = setup(['OK']);
    try {
      const dispatched: unknown[] = [];
      events.on('task.dispatched', (d) => dispatched.push(d));

      for await (const _event of dispatcher.dispatchStream(session.id, {
        type: 'freeform',
        prompt: 'Event test',
      })) {
        // consume
      }

      expect(dispatched).toHaveLength(1);
    } finally {
      cleanup();
    }
  });
});
