import { describe, it, expect, afterEach } from 'vitest';
import { Dispatcher, type DispatchStreamEvent } from '../core/dispatcher.js';
import { SessionManager } from '../core/session.js';
import { EventBus } from '../core/event-bus.js';
import { StateStore } from '../core/state-store.js';
import { ToolExecutor } from '../tools/executor.js';
import { ContextManager } from '../context/manager.js';
import type { ModelAdapter, ChatRequest, ChatResponse, ChatChunk } from '../types.js';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';

const TEST_DIR = join(process.cwd(), '.test-dispatch-stream-tools');
const STATE_FILE = join(TEST_DIR, 'state.json');
const PROMPTS_DIR = join(TEST_DIR, 'prompts');

/**
 * Creates a mock adapter where chatStream behavior changes per call.
 * Each element in `responses` is consumed in order — the first call to
 * chatStream yields responses[0], the second yields responses[1], etc.
 * This simulates the agentic loop: first response has tool calls,
 * second response is the final text answer.
 */
function makeMockToolAdapter(
  responses: Array<{
    textChunks?: string[];
    toolCallChunks?: Array<{ id: string; name: string; argumentFragments: string[] }>;
  }>,
): ModelAdapter {
  let callIndex = 0;

  return {
    provider: 'mock',
    models: ['mock-model'],

    async chat(_req: ChatRequest): Promise<ChatResponse> {
      return {
        content: 'non-streaming fallback',
        usage: { inputTokens: 10, outputTokens: 20, cost: 0.001 },
        model: 'mock-model',
        provider: 'mock',
        latencyMs: 50,
      };
    },

    async *chatStream(_req: ChatRequest): AsyncIterable<ChatChunk> {
      const resp = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;

      // Yield text chunks first (if any)
      if (resp.textChunks) {
        for (const text of resp.textChunks) {
          yield { delta: text, done: false };
        }
      }

      // Yield tool call deltas (if any)
      if (resp.toolCallChunks) {
        for (const tc of resp.toolCallChunks) {
          // First chunk: id + name (block start)
          yield {
            delta: '',
            toolCallDelta: { id: tc.id, name: tc.name },
            done: false,
          };

          // Argument fragment chunks
          for (const frag of tc.argumentFragments) {
            yield {
              delta: '',
              toolCallDelta: { id: tc.id, name: tc.name, arguments: frag },
              done: false,
            };
          }
        }
      }

      // Done
      yield { delta: '', done: true };
    },

    async ping(): Promise<boolean> {
      return true;
    },
  };
}

function makeMockRegistry(adapter: ModelAdapter) {
  return {
    getOrThrow(_name: string) { return adapter; },
    get(_name: string) { return adapter; },
    listAvailable() { return ['mock']; },
    listAllModels() { return [{ provider: 'mock', model: 'mock-model' }]; },
    async initialize() {},
  } as any;
}

function setup(adapter: ModelAdapter) {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  if (!existsSync(PROMPTS_DIR)) mkdirSync(PROMPTS_DIR, { recursive: true });

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
    { workingDirectory: TEST_DIR, maxToolCalls: 10 },
  );

  const session = sessions.create('mock', { provider: 'mock', model: 'mock-model' });

  return { dispatcher, session, sessions, events, tools, stateStore };
}

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
}

async function collectEvents(stream: AsyncIterable<DispatchStreamEvent>): Promise<DispatchStreamEvent[]> {
  const events: DispatchStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('dispatchStream with tool calls', () => {
  afterEach(cleanup);

  it('executes a single tool call and continues the agentic loop', async () => {
    // Response 1: model calls bash tool
    // Response 2: model returns final text
    const adapter = makeMockToolAdapter([
      {
        toolCallChunks: [{
          id: 'call_1',
          name: 'echo_tool',
          argumentFragments: ['{"msg":', '"hello"}'],
        }],
      },
      {
        textChunks: ['Tool result received: ', 'hello'],
      },
    ]);

    const { dispatcher, session, sessions, tools } = setup(adapter);

    // Register a simple tool the dispatcher can execute
    tools.register(
      {
        name: 'echo_tool',
        description: 'Echoes back the msg argument',
        parameters: {
          type: 'object',
          properties: { msg: { type: 'string' } },
          required: ['msg'],
        },
      },
      async (args) => {
        return `echoed: ${args.msg}`;
      },
    );

    const events = await collectEvents(
      dispatcher.dispatchStream(session.id, { type: 'freeform', prompt: 'Use the echo tool' }),
    );

    // Should have tool_call events
    const toolCallEvents = events.filter((e) => e.type === 'tool_call');
    expect(toolCallEvents).toHaveLength(1);
    expect((toolCallEvents[0] as any).tool).toBe('echo_tool');
    expect((toolCallEvents[0] as any).id).toBe('call_1');

    // Should have tool_result events
    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents).toHaveLength(1);
    expect((toolResultEvents[0] as any).tool).toBe('echo_tool');
    expect((toolResultEvents[0] as any).output).toBe('echoed: hello');
    expect((toolResultEvents[0] as any).isError).toBe(false);

    // Should have text deltas from the second response
    const textDeltas = events.filter((e) => e.type === 'delta' && !e.done && (e as any).delta !== '');
    expect(textDeltas.length).toBeGreaterThanOrEqual(2);

    // Should end with a complete event
    const completeEvents = events.filter((e) => e.type === 'complete');
    expect(completeEvents).toHaveLength(1);
    expect((completeEvents[0] as any).toolCallCount).toBe(1);

    // Session should have messages: user, assistant (tool call), tool result, assistant (final)
    const s = sessions.getOrThrow(session.id);
    const assistantMsgs = s.messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(2);
    // First assistant message should have tool calls
    expect(assistantMsgs[0].toolCalls).toBeDefined();
    expect(assistantMsgs[0].toolCalls![0].name).toBe('echo_tool');
    // Second assistant message should have the final text
    expect(assistantMsgs[1].content).toContain('Tool result received');

    // Tool result message
    const toolMsgs = s.messages.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0].content).toBe('echoed: hello');
    expect(toolMsgs[0].toolCallId).toBe('call_1');

    // Session should be idle
    expect(s.status).toBe('idle');
  });

  it('handles multiple parallel tool calls in one response', async () => {
    const adapter = makeMockToolAdapter([
      {
        toolCallChunks: [
          {
            id: 'call_a',
            name: 'echo_tool',
            argumentFragments: ['{"msg":"first"}'],
          },
          {
            id: 'call_b',
            name: 'echo_tool',
            argumentFragments: ['{"msg":"second"}'],
          },
        ],
      },
      {
        textChunks: ['Both tools executed successfully.'],
      },
    ]);

    const { dispatcher, session, tools } = setup(adapter);

    tools.register(
      {
        name: 'echo_tool',
        description: 'Echoes back the msg argument',
        parameters: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
      },
      async (args) => `echoed: ${args.msg}`,
    );

    const events = await collectEvents(
      dispatcher.dispatchStream(session.id, { type: 'freeform', prompt: 'Call two tools' }),
    );

    const toolCallEvents = events.filter((e) => e.type === 'tool_call');
    expect(toolCallEvents).toHaveLength(2);
    expect((toolCallEvents[0] as any).id).toBe('call_a');
    expect((toolCallEvents[1] as any).id).toBe('call_b');

    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents).toHaveLength(2);
    expect((toolResultEvents[0] as any).output).toBe('echoed: first');
    expect((toolResultEvents[1] as any).output).toBe('echoed: second');

    const completeEvents = events.filter((e) => e.type === 'complete');
    expect(completeEvents).toHaveLength(1);
    expect((completeEvents[0] as any).toolCallCount).toBe(2);
  });

  it('handles multi-turn tool use (tool -> text -> tool -> text)', async () => {
    const adapter = makeMockToolAdapter([
      // Turn 1: model calls tool
      {
        toolCallChunks: [{
          id: 'call_1',
          name: 'counter',
          argumentFragments: ['{"action":"increment"}'],
        }],
      },
      // Turn 2: model calls tool again
      {
        toolCallChunks: [{
          id: 'call_2',
          name: 'counter',
          argumentFragments: ['{"action":"increment"}'],
        }],
      },
      // Turn 3: model returns final text
      {
        textChunks: ['Counter is now at 2.'],
      },
    ]);

    const { dispatcher, session, sessions, tools } = setup(adapter);

    let count = 0;
    tools.register(
      {
        name: 'counter',
        description: 'Increments a counter',
        parameters: { type: 'object', properties: { action: { type: 'string' } }, required: ['action'] },
      },
      async () => {
        count++;
        return `count=${count}`;
      },
    );

    const events = await collectEvents(
      dispatcher.dispatchStream(session.id, { type: 'freeform', prompt: 'Increment twice' }),
    );

    const toolCallEvents = events.filter((e) => e.type === 'tool_call');
    expect(toolCallEvents).toHaveLength(2);

    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents).toHaveLength(2);
    expect((toolResultEvents[0] as any).output).toBe('count=1');
    expect((toolResultEvents[1] as any).output).toBe('count=2');

    expect(count).toBe(2);

    // Final state
    const s = sessions.getOrThrow(session.id);
    const toolMsgs = s.messages.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(2);
    expect(s.status).toBe('idle');
  });

  it('handles tool execution errors gracefully', async () => {
    const adapter = makeMockToolAdapter([
      {
        toolCallChunks: [{
          id: 'call_err',
          name: 'failing_tool',
          argumentFragments: ['{}'],
        }],
      },
      {
        textChunks: ['Tool failed, providing answer anyway.'],
      },
    ]);

    const { dispatcher, session, tools } = setup(adapter);

    tools.register(
      {
        name: 'failing_tool',
        description: 'Always fails',
        parameters: { type: 'object', properties: {} },
      },
      async () => {
        throw new Error('Tool execution failed intentionally');
      },
    );

    const events = await collectEvents(
      dispatcher.dispatchStream(session.id, { type: 'freeform', prompt: 'Use failing tool' }),
    );

    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents).toHaveLength(1);
    expect((toolResultEvents[0] as any).isError).toBe(true);
    expect((toolResultEvents[0] as any).output).toContain('Tool execution failed intentionally');

    // Should still complete (the model continues after the error)
    const completeEvents = events.filter((e) => e.type === 'complete');
    expect(completeEvents).toHaveLength(1);
  });

  it('enforces tool call limit', async () => {
    // Adapter that always returns tool calls regardless of context.
    // The dispatcher should inject a system message after the limit and
    // the adapter will then return text (simulating the model obeying).
    let streamCallCount = 0;
    const MAX_CALLS = 2;
    const adapter: ModelAdapter = {
      provider: 'mock',
      models: ['mock-model'],

      async chat(): Promise<ChatResponse> {
        return {
          content: 'fallback',
          usage: { inputTokens: 10, outputTokens: 20, cost: 0.001 },
          model: 'mock-model',
          provider: 'mock',
          latencyMs: 50,
        };
      },

      async *chatStream(_req: ChatRequest): AsyncIterable<ChatChunk> {
        streamCallCount++;
        // After exceeding limit, adapter always returns text (simulates model compliance)
        if (streamCallCount > MAX_CALLS + 1) {
          yield { delta: 'Stopping here.', done: false };
          yield { delta: '', done: true };
          return;
        }

        yield {
          delta: '',
          toolCallDelta: { id: `call_${streamCallCount}`, name: 'echo_tool' },
          done: false,
        };
        yield {
          delta: '',
          toolCallDelta: { id: `call_${streamCallCount}`, name: 'echo_tool', arguments: '{"msg":"ok"}' },
          done: false,
        };
        yield { delta: '', done: true };
      },

      async ping(): Promise<boolean> { return true; },
    };

    const { sessions, tools, stateStore } = setup(adapter);

    const limitedDispatcher = new Dispatcher(
      makeMockRegistry(adapter),
      new ContextManager(PROMPTS_DIR),
      sessions,
      tools,
      new EventBus(),
      stateStore,
      { workingDirectory: TEST_DIR, maxToolCalls: MAX_CALLS },
    );

    tools.register(
      {
        name: 'echo_tool',
        description: 'Echoes',
        parameters: { type: 'object', properties: { msg: { type: 'string' } } },
      },
      async (args) => `echoed: ${args.msg}`,
    );

    const session2 = sessions.create('mock', { provider: 'mock', model: 'mock-model' });

    const events = await collectEvents(
      limitedDispatcher.dispatchStream(session2.id, { type: 'freeform', prompt: 'Keep calling tools' }),
    );

    // Tool calls executed should not exceed limit
    const toolCallEvents = events.filter((e) => e.type === 'tool_call');
    expect(toolCallEvents.length).toBeLessThanOrEqual(MAX_CALLS);

    // Should complete
    const completeEvents = events.filter((e) => e.type === 'complete');
    expect(completeEvents).toHaveLength(1);
  });

  it('handles unknown/hallucinated tool names gracefully', async () => {
    // Model calls a tool that is not registered
    const adapter = makeMockToolAdapter([
      {
        toolCallChunks: [{
          id: 'call_hallucinated',
          name: 'nonexistent_tool',
          argumentFragments: ['{"query":"test"}'],
        }],
      },
      {
        textChunks: ['I could not find that tool, here is my answer.'],
      },
    ]);

    const { dispatcher, session, tools } = setup(adapter);

    // Register a different tool — nonexistent_tool is NOT registered
    tools.register(
      {
        name: 'echo_tool',
        description: 'Echoes',
        parameters: { type: 'object', properties: { msg: { type: 'string' } } },
      },
      async (args) => `echoed: ${args.msg}`,
    );

    const events = await collectEvents(
      dispatcher.dispatchStream(session.id, { type: 'freeform', prompt: 'Use nonexistent tool' }),
    );

    // Should have a tool_result with isError=true
    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents).toHaveLength(1);
    expect((toolResultEvents[0] as any).isError).toBe(true);
    expect((toolResultEvents[0] as any).output).toContain('Unknown tool');
    expect((toolResultEvents[0] as any).output).toContain('nonexistent_tool');

    // Should still complete — the model gets the error and continues
    const completeEvents = events.filter((e) => e.type === 'complete');
    expect(completeEvents).toHaveLength(1);
  });

  it('handles malformed JSON in tool call arguments', async () => {
    // Model streams argument fragments that assemble into invalid JSON
    const adapter = makeMockToolAdapter([
      {
        toolCallChunks: [{
          id: 'call_bad_json',
          name: 'echo_tool',
          argumentFragments: ['{"msg": "unclosed'],  // missing closing brace and quote
        }],
      },
      {
        textChunks: ['Recovered from bad JSON.'],
      },
    ]);

    const { dispatcher, session, tools } = setup(adapter);

    tools.register(
      {
        name: 'echo_tool',
        description: 'Echoes',
        parameters: { type: 'object', properties: { msg: { type: 'string' } } },
      },
      async (args) => `echoed: ${args.msg}`,
    );

    const events = await collectEvents(
      dispatcher.dispatchStream(session.id, { type: 'freeform', prompt: 'Send bad JSON' }),
    );

    // Should have a tool_result with isError=true (JSON.parse fails in executor)
    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents).toHaveLength(1);
    expect((toolResultEvents[0] as any).isError).toBe(true);
    expect((toolResultEvents[0] as any).output).toContain('Error executing tool');

    // Should still complete
    const completeEvents = events.filter((e) => e.type === 'complete');
    expect(completeEvents).toHaveLength(1);
  });

  it('accumulates fragmented tool call arguments correctly', async () => {
    // Simulate highly fragmented argument streaming
    const adapter = makeMockToolAdapter([
      {
        toolCallChunks: [{
          id: 'call_frag',
          name: 'echo_tool',
          argumentFragments: ['{"', 'msg', '":', '"he', 'llo ', 'wor', 'ld"}'],
        }],
      },
      {
        textChunks: ['Done.'],
      },
    ]);

    const { dispatcher, session, tools } = setup(adapter);

    let receivedMsg = '';
    tools.register(
      {
        name: 'echo_tool',
        description: 'Echoes',
        parameters: { type: 'object', properties: { msg: { type: 'string' } } },
      },
      async (args) => {
        receivedMsg = String(args.msg);
        return `echoed: ${receivedMsg}`;
      },
    );

    const events = await collectEvents(
      dispatcher.dispatchStream(session.id, { type: 'freeform', prompt: 'Fragment test' }),
    );

    // The tool should have received the correctly assembled argument
    expect(receivedMsg).toBe('hello world');

    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents).toHaveLength(1);
    expect((toolResultEvents[0] as any).output).toBe('echoed: hello world');
  });

  it('emits tool.executed and tool.finished events', async () => {
    const adapter = makeMockToolAdapter([
      {
        toolCallChunks: [{
          id: 'call_ev',
          name: 'echo_tool',
          argumentFragments: ['{"msg":"test"}'],
        }],
      },
      {
        textChunks: ['Done.'],
      },
    ]);

    const { dispatcher, session, events: eventBus, tools } = setup(adapter);

    tools.register(
      {
        name: 'echo_tool',
        description: 'Echoes',
        parameters: { type: 'object', properties: { msg: { type: 'string' } } },
      },
      async (args) => `echoed: ${args.msg}`,
    );

    const executedEvents: unknown[] = [];
    const finishedEvents: unknown[] = [];
    eventBus.on('tool.executed', (d) => executedEvents.push(d));
    eventBus.on('tool.finished', (d) => finishedEvents.push(d));

    await collectEvents(
      dispatcher.dispatchStream(session.id, { type: 'freeform', prompt: 'Event test' }),
    );

    expect(executedEvents).toHaveLength(1);
    expect((executedEvents[0] as any).tool).toBe('echo_tool');

    expect(finishedEvents).toHaveLength(1);
    expect((finishedEvents[0] as any).tool).toBe('echo_tool');
    expect((finishedEvents[0] as any).isError).toBe(false);
  });

  it('handles response with both text and tool calls', async () => {
    // Some models emit text before tool calls in the same response
    const adapter: ModelAdapter = {
      provider: 'mock',
      models: ['mock-model'],

      async chat(): Promise<ChatResponse> {
        return {
          content: 'fallback',
          usage: { inputTokens: 10, outputTokens: 20, cost: 0.001 },
          model: 'mock-model',
          provider: 'mock',
          latencyMs: 50,
        };
      },

      async *chatStream(_req: ChatRequest): AsyncIterable<ChatChunk> {
        const hasToolResult = _req.messages.some((m) => m.role === 'tool');

        if (!hasToolResult) {
          // First call: text then tool call
          yield { delta: 'Let me check... ', done: false };
          yield {
            delta: '',
            toolCallDelta: { id: 'call_mixed', name: 'echo_tool' },
            done: false,
          };
          yield {
            delta: '',
            toolCallDelta: { id: 'call_mixed', name: 'echo_tool', arguments: '{"msg":"data"}' },
            done: false,
          };
          yield { delta: '', done: true };
        } else {
          // Second call: just text
          yield { delta: 'Result: done.', done: false };
          yield { delta: '', done: true };
        }
      },

      async ping(): Promise<boolean> { return true; },
    };

    const { dispatcher, session, sessions, tools } = setup(adapter);

    tools.register(
      {
        name: 'echo_tool',
        description: 'Echoes',
        parameters: { type: 'object', properties: { msg: { type: 'string' } } },
      },
      async (args) => `echoed: ${args.msg}`,
    );

    const events = await collectEvents(
      dispatcher.dispatchStream(session.id, { type: 'freeform', prompt: 'Mixed response' }),
    );

    // Should have text deltas from first response
    const textDeltas = events.filter(
      (e) => e.type === 'delta' && !e.done && (e as any).delta !== '',
    );
    expect(textDeltas.some((d) => (d as any).delta === 'Let me check... ')).toBe(true);
    expect(textDeltas.some((d) => (d as any).delta === 'Result: done.')).toBe(true);

    // Should have tool call and result
    expect(events.filter((e) => e.type === 'tool_call')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'tool_result')).toHaveLength(1);

    // First assistant message should have both content and tool calls
    const s = sessions.getOrThrow(session.id);
    const firstAssistant = s.messages.find((m) => m.role === 'assistant');
    expect(firstAssistant?.content).toBe('Let me check... ');
    expect(firstAssistant?.toolCalls).toBeDefined();
    expect(firstAssistant?.toolCalls![0].name).toBe('echo_tool');
  });

  it('session status is error when adapter throws mid-stream', async () => {
    const adapter: ModelAdapter = {
      provider: 'mock',
      models: ['mock-model'],

      async chat(): Promise<ChatResponse> {
        throw new Error('not implemented');
      },

      async *chatStream(): AsyncIterable<ChatChunk> {
        yield { delta: 'Starting...', done: false };
        throw new Error('Stream died unexpectedly');
      },

      async ping(): Promise<boolean> { return true; },
    };

    const { dispatcher, session, sessions } = setup(adapter);

    const events = await collectEvents(
      dispatcher.dispatchStream(session.id, { type: 'freeform', prompt: 'Crash test' }),
    );

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as any).error).toContain('Stream died unexpectedly');

    const s = sessions.getOrThrow(session.id);
    expect(s.status).toBe('error');
  });
});
