import Anthropic from '@anthropic-ai/sdk';
import { BaseAdapter } from './base.js';
import type { ChatRequest, ChatResponse, ChatChunk, AdapterConfig } from '../types.js';
import { calculateCost } from '../types.js';

export class AnthropicAdapter extends BaseAdapter {
  readonly provider = 'anthropic';
  readonly models = [
    'claude-sonnet-4-20250514',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-haiku-20241022',
  ];

  private client: Anthropic;

  constructor(config: AdapterConfig) {
    super(config);
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const start = Date.now();

      const messages = request.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      const params: Anthropic.MessageCreateParams = {
        model: request.model || this.models[0],
        max_tokens: request.maxTokens ?? 4096,
        system: request.systemPrompt,
        messages,
      };

      if (request.temperature !== undefined) {
        params.temperature = request.temperature;
      }

      if (request.tools?.length) {
        params.tools = request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool['input_schema'],
        }));
      }

      const response = await this.client.messages.create(params);
      const latencyMs = Date.now() - start;

      let content = '';
      const toolCalls: ChatResponse['toolCalls'] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input),
          });
        }
      }

      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cost: calculateCost(request.model || this.models[0], {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        }),
      };

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        model: response.model,
        provider: this.provider,
        latencyMs,
        raw: response,
      };
    });
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const stream = this.client.messages.stream({
      model: request.model || this.models[0],
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages,
      ...(request.temperature !== undefined && { temperature: request.temperature }),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if ('text' in delta) {
          yield { delta: delta.text, done: false };
        }
      } else if (event.type === 'message_stop') {
        yield { delta: '', done: true };
      }
    }
  }
}
