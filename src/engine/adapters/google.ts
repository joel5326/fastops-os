import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { BaseAdapter } from './base.js';
import type { ChatRequest, ChatResponse, ChatChunk, AdapterConfig } from '../types.js';
import { calculateCost } from '../types.js';

export class GoogleAdapter extends BaseAdapter {
  readonly provider = 'google';
  readonly models = [
    'gemini-2.5-pro-preview-05-06',
    'gemini-2.5-flash-preview-05-20',
    'gemini-2.0-flash',
  ];

  private client: GoogleGenAI;

  constructor(config: AdapterConfig) {
    super(config);
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const start = Date.now();
      const model = request.model || this.models[0];

      const contents = request.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }],
      }));

      const response: GenerateContentResponse = await this.client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: request.systemPrompt,
          maxOutputTokens: request.maxTokens ?? 4096,
          ...(request.temperature !== undefined && { temperature: request.temperature }),
        },
      });

      const latencyMs = Date.now() - start;
      const text = response.text ?? '';
      const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

      return {
        content: text,
        usage: {
          inputTokens,
          outputTokens,
          cost: calculateCost(model, { inputTokens, outputTokens }),
        },
        model,
        provider: this.provider,
        latencyMs,
        raw: response,
      };
    });
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const model = request.model || this.models[0];

    const contents = request.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }));

    const response = await this.client.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: request.systemPrompt,
        maxOutputTokens: request.maxTokens ?? 4096,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
      },
    });

    for await (const chunk of response) {
      const text = chunk.text ?? '';
      if (text) {
        yield { delta: text, done: false };
      }
    }
    yield { delta: '', done: true };
  }
}
