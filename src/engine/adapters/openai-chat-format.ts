import type OpenAI from 'openai';
import type { ChatRequest, ToolCall } from '../types.js';

/**
 * Shared mapping for OpenAI Chat Completions–compatible APIs (OpenAI, OpenRouter, etc.):
 * assistant messages may include tool_calls; tool role carries tool_call_id + output.
 */
export function toOpenAIChatCompletionMessages(
  request: ChatRequest,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: request.systemPrompt },
  ];

  for (const m of request.messages) {
    if (m.role === 'system') continue;

    if (m.role === 'assistant') {
      const hasText = Boolean(m.content?.trim());
      const hasTools = Boolean(m.toolCalls?.length);
      if (!hasText && !hasTools) continue;

      const assistant: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
        role: 'assistant',
        content: hasText ? m.content : null,
      };
      if (hasTools) {
        assistant.tool_calls = m.toolCalls!.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }
      messages.push(assistant);
      continue;
    }

    if (m.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: m.toolCallId ?? '',
        content: m.content,
      });
      continue;
    }

    messages.push({ role: 'user', content: m.content });
  }

  return messages;
}

/** Normalize OpenAI-style assistant.tool_calls into FastOps ToolCall list. */
export function toolCallsFromOpenAICompletion(
  toolCalls: OpenAI.Chat.ChatCompletionMessage['tool_calls'],
): ToolCall[] {
  const out: ToolCall[] = [];
  if (!toolCalls) return out;
  for (const tc of toolCalls) {
    if (tc.type === 'function') {
      out.push({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      });
    }
  }
  return out;
}
