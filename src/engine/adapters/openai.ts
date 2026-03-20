import OpenAI from 'openai';
import { BaseAdapter } from './base.js';
import type { ChatRequest, ChatResponse, ChatChunk, AdapterConfig } from '../types.js';
import { calculateCost } from '../types.js';

export class OpenAIAdapter extends BaseAdapter {
  readonly provider = 'openai';
  readonly models = ['gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini'];

  private client: OpenAI;

  constructor(config: AdapterConfig) {
    super(config);
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const start = Date.now();

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: request.systemPrompt },
        ...request.messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
      ];

      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: request.model || this.models[0],
        messages,
        max_tokens: request.maxTokens ?? 4096,
      };

      if (request.temperature !== undefined) {
        params.temperature = request.temperature;
      }

      if (request.tools?.length) {
        params.tools = request.tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }

      const response = await this.client.chat.completions.create(params);
      const latencyMs = Date.now() - start;
      const choice = response.choices[0];

      const toolCalls: ChatResponse['toolCalls'] = [];
      if (choice.message.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          if (tc.type === 'function') {
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
            });
          }
        }
      }

      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;

      return {
        content: choice.message.content ?? '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          inputTokens,
          outputTokens,
          cost: calculateCost(request.model || this.models[0], { inputTokens, outputTokens }),
        },
        model: response.model,
        provider: this.provider,
        latencyMs,
        raw: response,
      };
    });
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: request.systemPrompt },
      ...request.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const stream = await this.client.chat.completions.create({
      model: request.model || this.models[0],
      messages,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
      ...(request.temperature !== undefined && { temperature: request.temperature }),
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield { delta: delta.content, done: false };
      }
      if (chunk.choices[0]?.finish_reason) {
        yield { delta: '', done: true };
      }
    }
  }
}
