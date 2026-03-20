import { config as dotenvConfig } from 'dotenv';

export type SecurityTier = 'development' | 'enterprise';

export interface FastOpsConfig {
  port: number;
  securityTier: SecurityTier;
  adapters: {
    anthropic?: { apiKey: string };
    openai?: { apiKey: string };
    google?: { apiKey: string };
    openrouter?: { apiKey: string };
    mistral?: { apiKey: string };
    xai?: { apiKey: string };
    moonshot?: { apiKey: string };
  };
}

export function loadConfig(): FastOpsConfig {
  dotenvConfig();

  const securityTier = (process.env.FASTOPS_SECURITY_TIER || 'development') as SecurityTier;
  const port = parseInt(process.env.FASTOPS_PORT || '3100', 10);

  const adapters: FastOpsConfig['adapters'] = {};

  if (process.env.ANTHROPIC_API_KEY) {
    adapters.anthropic = { apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    adapters.openai = { apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.GEMINI_API_KEY) {
    adapters.google = { apiKey: process.env.GEMINI_API_KEY };
  }
  if (process.env.OPENROUTER_API_KEY) {
    adapters.openrouter = { apiKey: process.env.OPENROUTER_API_KEY };
  }
  if (process.env.MISTRAL_API_KEY) {
    adapters.mistral = { apiKey: process.env.MISTRAL_API_KEY };
  }
  if (process.env.XAI_API_KEY) {
    adapters.xai = { apiKey: process.env.XAI_API_KEY };
  }
  if (process.env.MOONSHOT_API_KEY) {
    adapters.moonshot = { apiKey: process.env.MOONSHOT_API_KEY };
  }

  if (securityTier === 'enterprise') {
    const directOnly = ['openrouter', 'xai', 'moonshot'] as const;
    for (const name of directOnly) {
      if (adapters[name]) {
        console.warn(`[Config] Enterprise mode: disabling direct-only adapter '${name}'`);
        delete adapters[name];
      }
    }

    const hasCloudAdapter = adapters.anthropic || adapters.openai || adapters.google;
    if (!hasCloudAdapter) {
      throw new Error(
        'Enterprise security tier requires at least 1 cloud-hosted adapter. ' +
        'Configure ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.'
      );
    }
  }

  return { port, securityTier, adapters };
}
