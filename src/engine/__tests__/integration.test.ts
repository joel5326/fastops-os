import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../config.js';
import { AdapterRegistry } from '../adapters/registry.js';
import type { ChatRequest } from '../types.js';

const PING_REQUEST: ChatRequest = {
  model: '',
  systemPrompt: 'You are a test assistant. Respond with exactly: FASTOPS_OK',
  messages: [{ role: 'user', content: 'Respond with exactly: FASTOPS_OK' }],
  maxTokens: 20,
  temperature: 0,
};

describe('Adapter Integration Tests (real API calls)', () => {
  const config = loadConfig();
  const registry = new AdapterRegistry(config);

  it('initializes registry with available adapters', async () => {
    await registry.initialize();
    const available = registry.listAvailable();
    expect(available.length).toBeGreaterThanOrEqual(1);
    console.log('Available adapters:', available);
  });

  it('Anthropic adapter: chat returns valid response', async () => {
    await registry.initialize();
    const adapter = registry.get('anthropic');
    if (!adapter) return;

    const response = await adapter.chat({
      ...PING_REQUEST,
      model: 'claude-sonnet-4-20250514',
    });

    expect(response.content).toBeTruthy();
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.usage.outputTokens).toBeGreaterThan(0);
    expect(response.provider).toBe('anthropic');
    expect(response.latencyMs).toBeGreaterThan(0);
    console.log(`Anthropic: "${response.content}" (${response.latencyMs}ms, $${response.usage.cost.toFixed(6)})`);
  }, 30000);

  it('OpenAI adapter: chat returns valid response', async () => {
    await registry.initialize();
    const adapter = registry.get('openai');
    if (!adapter) return;

    const response = await adapter.chat({
      ...PING_REQUEST,
      model: 'gpt-4o-mini',
    });

    expect(response.content).toBeTruthy();
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.provider).toBe('openai');
    console.log(`OpenAI: "${response.content}" (${response.latencyMs}ms, $${response.usage.cost.toFixed(6)})`);
  }, 30000);

  it('Google adapter: chat returns valid response', async () => {
    await registry.initialize();
    const adapter = registry.get('google');
    if (!adapter) return;

    const response = await adapter.chat({
      ...PING_REQUEST,
      model: 'gemini-2.0-flash',
    });

    expect(response.content).toBeTruthy();
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.provider).toBe('google');
    console.log(`Google: "${response.content}" (${response.latencyMs}ms, $${response.usage.cost.toFixed(6)})`);
  }, 30000);

  it('Anthropic adapter: streaming works', async () => {
    await registry.initialize();
    const adapter = registry.get('anthropic');
    if (!adapter) return;

    let fullText = '';
    let chunkCount = 0;

    for await (const chunk of adapter.chatStream({
      ...PING_REQUEST,
      model: 'claude-sonnet-4-20250514',
    })) {
      fullText += chunk.delta;
      chunkCount++;
      if (chunk.done) break;
    }

    expect(fullText).toBeTruthy();
    expect(chunkCount).toBeGreaterThan(1);
    console.log(`Anthropic stream: "${fullText}" (${chunkCount} chunks)`);
  }, 30000);

  it('ping() works for all available adapters', async () => {
    await registry.initialize();
    const results: Array<{ name: string; ok: boolean }> = [];
    for (const name of registry.listAvailable()) {
      const adapter = registry.get(name)!;
      const ok = await adapter.ping();
      results.push({ name, ok });
      console.log(`${name} ping: ${ok}`);
    }
    const passing = results.filter((r) => r.ok);
    expect(passing.length).toBeGreaterThanOrEqual(2);
    console.log(`${passing.length}/${results.length} adapters healthy`);
  }, 60000);
});
