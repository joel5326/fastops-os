const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-sonnet-4-20250514': 200_000,
  'claude-3-7-sonnet-20250219': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-opus-20240229': 200_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'o3': 200_000,
  'o3-mini': 200_000,
  'gemini-2.5-pro-preview-05-06': 1_000_000,
  'gemini-2.5-flash-preview-05-20': 1_000_000,
  'gemini-2.0-flash': 1_000_000,
};

export function getContextWindow(model: string): number {
  return MODEL_CONTEXT_WINDOWS[model] ?? 128_000;
}
