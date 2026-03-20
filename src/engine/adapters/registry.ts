import type { ModelAdapter } from '../types.js';
import type { FastOpsConfig } from '../../config.js';
import { AnthropicAdapter } from './anthropic.js';
import { OpenAIAdapter } from './openai.js';
import { GoogleAdapter } from './google.js';
import { OpenRouterAdapter } from './openrouter.js';

export class AdapterRegistry {
  private adapters = new Map<string, ModelAdapter>();
  private config: FastOpsConfig;

  constructor(config: FastOpsConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const { adapters, securityTier } = this.config;

    if (adapters.anthropic) {
      this.adapters.set('anthropic', new AnthropicAdapter(adapters.anthropic));
    }

    if (adapters.openai) {
      this.adapters.set('openai', new OpenAIAdapter(adapters.openai));
    }

    if (adapters.google) {
      this.adapters.set('google', new GoogleAdapter(adapters.google));
    }

    if (adapters.openrouter && securityTier !== 'enterprise') {
      this.adapters.set('openrouter', new OpenRouterAdapter(adapters.openrouter));
    }

    if (this.adapters.size === 0) {
      throw new Error(
        'No adapters configured. Set at least one API key in .env ' +
        '(ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY).'
      );
    }
  }

  get(provider: string): ModelAdapter | undefined {
    return this.adapters.get(provider);
  }

  getOrThrow(provider: string): ModelAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(
        `Adapter '${provider}' not available. ` +
        `Configured: ${this.listAvailable().join(', ')}`
      );
    }
    return adapter;
  }

  listAvailable(): string[] {
    return Array.from(this.adapters.keys());
  }

  listAllModels(): Array<{ provider: string; model: string }> {
    const result: Array<{ provider: string; model: string }> = [];
    for (const [provider, adapter] of this.adapters) {
      for (const model of adapter.models) {
        result.push({ provider, model });
      }
    }
    return result;
  }

  isEnterpriseSafe(provider: string): boolean {
    const directOnly = new Set(['openrouter', 'xai', 'moonshot']);
    return !directOnly.has(provider);
  }
}
