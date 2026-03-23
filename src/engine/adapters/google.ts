import {
  GoogleGenAI,
  type GenerateContentResponse,
  FunctionResponse,
  FunctionCallingConfigMode,
  type Content,
  type Part,
} from '@google/genai';
import { BaseAdapter } from './base.js';
import type { ChatRequest, ChatResponse, ChatChunk, AdapterConfig, Message } from '../types.js';
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

  /**
   * Maps FastOps messages to Gemini contents:
   * - user → role user, text parts
   * - assistant → role model, text + functionCall parts (prior model turn)
   * - tool → role user, functionResponse parts (paired with prior functionCall id/name)
   */
  private toGeminiContents(messages: Message[]): Content[] {
    const contents: Content[] = [];

    for (const m of messages) {
      if (m.role === 'system') continue;

      if (m.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: m.content }],
        });
        continue;
      }

      if (m.role === 'assistant') {
        const parts: Part[] = [];
        if (m.content?.trim()) {
          parts.push({ text: m.content });
        }
        if (m.toolCalls?.length) {
          for (const tc of m.toolCalls) {
            let args: Record<string, unknown> = {};
            try {
              args = tc.arguments ? (JSON.parse(tc.arguments) as Record<string, unknown>) : {};
            } catch {
              args = { _raw: tc.arguments };
            }
            parts.push({
              functionCall: {
                id: tc.id,
                name: tc.name,
                args,
              },
            });
          }
        }
        if (parts.length === 0) continue;
        contents.push({ role: 'model', parts });
        continue;
      }

      if (m.role === 'tool') {
        const fr = new FunctionResponse();
        fr.id = m.toolCallId;
        fr.name = m.name ?? 'tool';
        fr.response = { output: m.content };
        contents.push({
          role: 'user',
          parts: [{ functionResponse: fr }],
        });
        continue;
      }
    }

    return contents;
  }

  private toolConfig(request: ChatRequest) {
    if (!request.tools?.length) return undefined;
    return {
      tools: [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parametersJsonSchema: t.parameters,
          })),
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.AUTO,
        },
      },
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const start = Date.now();
      const model = request.model || this.models[0];

      const contents = this.toGeminiContents(request.messages);
      const toolsCfg = this.toolConfig(request);

      const response: GenerateContentResponse = await this.client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: request.systemPrompt,
          maxOutputTokens: request.maxTokens ?? 4096,
          ...(request.temperature !== undefined && { temperature: request.temperature }),
          ...toolsCfg,
        },
      });

      const latencyMs = Date.now() - start;
      const text = response.text ?? '';
      const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

      const toolCalls: ChatResponse['toolCalls'] = [];
      const fcList = response.functionCalls;
      if (fcList?.length) {
        for (const fc of fcList) {
          toolCalls.push({
            id: fc.id ?? '',
            name: fc.name ?? '',
            arguments: JSON.stringify(fc.args ?? {}),
          });
        }
      }

      return {
        content: text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
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

    const contents = this.toGeminiContents(request.messages);
    const toolsCfg = this.toolConfig(request);

    const response = await this.client.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: request.systemPrompt,
        maxOutputTokens: request.maxTokens ?? 4096,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
        ...toolsCfg,
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
