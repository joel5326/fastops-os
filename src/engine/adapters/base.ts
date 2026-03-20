import type { ModelAdapter, ChatRequest, ChatResponse, ChatChunk, AdapterConfig } from '../types.js';

export abstract class BaseAdapter implements ModelAdapter {
  abstract readonly provider: string;
  abstract readonly models: string[];

  protected config: AdapterConfig;
  protected retryCount = 3;
  protected retryBaseMs = 1000;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  abstract chat(request: ChatRequest): Promise<ChatResponse>;
  abstract chatStream(request: ChatRequest): AsyncIterable<ChatChunk>;

  async ping(): Promise<boolean> {
    try {
      const response = await this.chat({
        model: this.models[0],
        systemPrompt: 'Respond with OK.',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 5,
      });
      return response.content.length > 0;
    } catch {
      return false;
    }
  }

  protected async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (this.isRateLimitError(lastError)) {
          const backoff = this.retryBaseMs * Math.pow(2, attempt);
          await this.sleep(backoff);
          continue;
        }
        throw lastError;
      }
    }
    throw lastError ?? new Error('Retry exhausted');
  }

  private isRateLimitError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
