import { describe, it, expect } from 'vitest';
import { toOpenAIChatCompletionMessages, toolCallsFromOpenAICompletion } from '../openai-chat-format.js';

describe('toOpenAIChatCompletionMessages', () => {
  it('maps assistant tool_calls and tool results', () => {
    const messages = toOpenAIChatCompletionMessages({
      model: 'gpt-4o',
      systemPrompt: 'sys',
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'call_1', name: 'bash', arguments: '{"command":"echo 1"}' },
          ],
        },
        { role: 'tool', content: '1', toolCallId: 'call_1', name: 'bash' },
      ],
    });

    expect(messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(messages[1]).toEqual({ role: 'user', content: 'hi' });
    expect(messages[2]).toMatchObject({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'bash', arguments: '{"command":"echo 1"}' },
        },
      ],
    });
    expect(messages[3]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '1',
    });
  });
});

describe('toolCallsFromOpenAICompletion', () => {
  it('extracts function tool calls', () => {
    const out = toolCallsFromOpenAICompletion([
      {
        id: 'x',
        type: 'function',
        function: { name: 'fn', arguments: '{}' },
      },
    ] as unknown as Parameters<typeof toolCallsFromOpenAICompletion>[0]);
    expect(out).toEqual([{ id: 'x', name: 'fn', arguments: '{}' }]);
  });
});
