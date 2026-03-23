import { describe, it, expect } from 'vitest';
import type { ChatChunk } from '../../types.js';

/**
 * Tests for streaming tool call support across adapters.
 *
 * These tests verify the ChatChunk.toolCallDelta contract that all adapters
 * must follow when streaming tool calls. The actual adapter implementations
 * use provider-specific streaming formats, but they all produce ChatChunk
 * objects with the same shape.
 */

describe('ChatChunk toolCallDelta contract', () => {
  it('toolCallDelta is optional on ChatChunk', () => {
    const textChunk: ChatChunk = { delta: 'hello', done: false };
    expect(textChunk.toolCallDelta).toBeUndefined();
  });

  it('toolCallDelta can carry id and name (block start)', () => {
    const chunk: ChatChunk = {
      delta: '',
      toolCallDelta: {
        id: 'call_123',
        name: 'bash',
      },
      done: false,
    };
    expect(chunk.toolCallDelta?.id).toBe('call_123');
    expect(chunk.toolCallDelta?.name).toBe('bash');
    expect(chunk.toolCallDelta?.arguments).toBeUndefined();
  });

  it('toolCallDelta can carry argument fragments', () => {
    const chunk: ChatChunk = {
      delta: '',
      toolCallDelta: {
        id: 'call_123',
        name: 'bash',
        arguments: '{"comma',
      },
      done: false,
    };
    expect(chunk.toolCallDelta?.arguments).toBe('{"comma');
  });

  it('done chunk has no toolCallDelta', () => {
    const chunk: ChatChunk = { delta: '', done: true };
    expect(chunk.toolCallDelta).toBeUndefined();
    expect(chunk.done).toBe(true);
  });
});

describe('OpenAI-style streaming tool call accumulation', () => {
  /**
   * Simulates the OpenAI/OpenRouter streaming pattern where tool_calls
   * arrive as incremental deltas keyed by index. Tests that the
   * accumulation logic (used in openai.ts and openrouter.ts) correctly
   * assembles fragments.
   */
  it('accumulates fragmented tool call arguments', () => {
    // Simulate the accumulator used in OpenAI/OpenRouter adapters
    const toolCallAccum = new Map<number, { id: string; name: string; arguments: string }>();

    // Simulated stream deltas (what OpenAI sends)
    const deltas = [
      { index: 0, id: 'call_1', function: { name: 'bash', arguments: '' } },
      { index: 0, id: undefined, function: { name: undefined, arguments: '{"com' } },
      { index: 0, id: undefined, function: { name: undefined, arguments: 'mand":' } },
      { index: 0, id: undefined, function: { name: undefined, arguments: '"echo 1"}' } },
    ];

    const chunks: ChatChunk[] = [];

    for (const tc of deltas) {
      const idx = tc.index;
      if (!toolCallAccum.has(idx)) {
        toolCallAccum.set(idx, { id: '', name: '', arguments: '' });
      }
      const acc = toolCallAccum.get(idx)!;
      if (tc.id) acc.id = tc.id;
      if (tc.function?.name) acc.name += tc.function.name;
      if (tc.function?.arguments) acc.arguments += tc.function.arguments;

      chunks.push({
        delta: '',
        toolCallDelta: {
          id: acc.id || undefined,
          name: acc.name || undefined,
          arguments: tc.function?.arguments || undefined,
        },
        done: false,
      });
    }

    // First chunk should have id and name
    expect(chunks[0].toolCallDelta?.id).toBe('call_1');
    expect(chunks[0].toolCallDelta?.name).toBe('bash');

    // Subsequent chunks carry argument fragments
    expect(chunks[1].toolCallDelta?.arguments).toBe('{"com');
    expect(chunks[2].toolCallDelta?.arguments).toBe('mand":');
    expect(chunks[3].toolCallDelta?.arguments).toBe('"echo 1"}');

    // Accumulator should have full assembled result
    const final = toolCallAccum.get(0)!;
    expect(final.id).toBe('call_1');
    expect(final.name).toBe('bash');
    expect(final.arguments).toBe('{"command":"echo 1"}');
    expect(JSON.parse(final.arguments)).toEqual({ command: 'echo 1' });
  });

  it('handles multiple parallel tool calls', () => {
    const toolCallAccum = new Map<number, { id: string; name: string; arguments: string }>();

    const deltas = [
      { index: 0, id: 'call_1', function: { name: 'read_file', arguments: '' } },
      { index: 1, id: 'call_2', function: { name: 'bash', arguments: '' } },
      { index: 0, id: undefined, function: { name: undefined, arguments: '{"path":"/a.ts"}' } },
      { index: 1, id: undefined, function: { name: undefined, arguments: '{"command":"ls"}' } },
    ];

    for (const tc of deltas) {
      const idx = tc.index;
      if (!toolCallAccum.has(idx)) {
        toolCallAccum.set(idx, { id: '', name: '', arguments: '' });
      }
      const acc = toolCallAccum.get(idx)!;
      if (tc.id) acc.id = tc.id;
      if (tc.function?.name) acc.name += tc.function.name;
      if (tc.function?.arguments) acc.arguments += tc.function.arguments;
    }

    expect(toolCallAccum.get(0)).toEqual({
      id: 'call_1',
      name: 'read_file',
      arguments: '{"path":"/a.ts"}',
    });
    expect(toolCallAccum.get(1)).toEqual({
      id: 'call_2',
      name: 'bash',
      arguments: '{"command":"ls"}',
    });
  });
});

describe('Anthropic-style streaming tool call pattern', () => {
  it('produces toolCallDelta on content_block_start and input_json_delta', () => {
    // Simulate the Anthropic streaming pattern
    const chunks: ChatChunk[] = [];

    // content_block_start with tool_use
    chunks.push({
      delta: '',
      toolCallDelta: {
        id: 'toolu_01',
        name: 'bash',
      },
      done: false,
    });

    // input_json_delta fragments
    const jsonFragments = ['{"co', 'mmand":', '"echo hello"}'];
    for (const frag of jsonFragments) {
      chunks.push({
        delta: '',
        toolCallDelta: {
          id: 'toolu_01',
          name: 'bash',
          arguments: frag,
        },
        done: false,
      });
    }

    // Verify first chunk has id + name
    expect(chunks[0].toolCallDelta?.id).toBe('toolu_01');
    expect(chunks[0].toolCallDelta?.name).toBe('bash');
    expect(chunks[0].toolCallDelta?.arguments).toBeUndefined();

    // Verify argument fragments
    const assembled = chunks
      .filter((c) => c.toolCallDelta?.arguments)
      .map((c) => c.toolCallDelta!.arguments)
      .join('');
    expect(assembled).toBe('{"command":"echo hello"}');
    expect(JSON.parse(assembled)).toEqual({ command: 'echo hello' });
  });

  it('handles parallel tool calls via content block index tracking', () => {
    // Simulate the Anthropic pattern with two parallel tool_use blocks.
    // The adapter uses a Map<index, {id, name}> to track blocks, not a single variable.
    const toolBlockMap = new Map<number, { id: string; name: string }>();
    const chunks: ChatChunk[] = [];

    // Simulated events (what Anthropic sends)
    const events = [
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_01', name: 'read_file' } },
      { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_02', name: 'bash' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":' } },
      { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"command":' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"/a.ts"}' } },
      { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"ls"}' } },
    ];

    for (const event of events) {
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        toolBlockMap.set(event.index, { id: event.content_block.id, name: event.content_block.name });
        chunks.push({
          delta: '',
          toolCallDelta: { id: event.content_block.id, name: event.content_block.name },
          done: false,
        });
      } else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
        const toolBlock = toolBlockMap.get(event.index);
        chunks.push({
          delta: '',
          toolCallDelta: { id: toolBlock?.id, name: toolBlock?.name, arguments: event.delta.partial_json },
          done: false,
        });
      }
    }

    // Tool 1 (read_file) chunks should have id toolu_01
    const tool1Chunks = chunks.filter((c) => c.toolCallDelta?.id === 'toolu_01');
    expect(tool1Chunks).toHaveLength(3); // 1 start + 2 arg fragments
    const tool1Args = tool1Chunks.filter((c) => c.toolCallDelta?.arguments).map((c) => c.toolCallDelta!.arguments).join('');
    expect(JSON.parse(tool1Args)).toEqual({ path: '/a.ts' });

    // Tool 2 (bash) chunks should have id toolu_02
    const tool2Chunks = chunks.filter((c) => c.toolCallDelta?.id === 'toolu_02');
    expect(tool2Chunks).toHaveLength(3); // 1 start + 2 arg fragments
    const tool2Args = tool2Chunks.filter((c) => c.toolCallDelta?.arguments).map((c) => c.toolCallDelta!.arguments).join('');
    expect(JSON.parse(tool2Args)).toEqual({ command: 'ls' });
  });
});

describe('Google-style streaming tool call pattern', () => {
  it('produces toolCallDelta with complete arguments per functionCall', () => {
    // Gemini sends complete functionCalls per chunk (not fragmented)
    const chunk: ChatChunk = {
      delta: '',
      toolCallDelta: {
        id: 'fc_1',
        name: 'bash',
        arguments: JSON.stringify({ command: 'ls -la' }),
      },
      done: false,
    };

    expect(chunk.toolCallDelta?.name).toBe('bash');
    expect(JSON.parse(chunk.toolCallDelta!.arguments!)).toEqual({ command: 'ls -la' });
  });
});
