import OpenAI from 'openai';
import { BaseAdapter } from './base.js';
import type { ChatRequest, ChatResponse, ChatChunk, AdapterConfig } from '../types.js';

export class OpenRouterAdapter extends BaseAdapter {
  readonly provider = 'openrouter';
  readonly models = ['auto'];

  private client: OpenAI;

  constructor(config: AdapterConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://fastops.ai',
        'X-Title': 'FastOps OS',
      },
    });
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

      const response = await this.client.chat.completions.create({
        model: request.model || 'auto',
        messages,
        max_tokens: request.maxTokens ?? 4096,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
      });

      const latencyMs = Date.now() - start;
      const choice = response.choices[0];

      return {
        content: choice.message.content ?? '',
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          cost: 0,
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
      model: request.model || 'auto',
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
