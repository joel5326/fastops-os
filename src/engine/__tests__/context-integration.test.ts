import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../config.js';
import { AdapterRegistry } from '../adapters/registry.js';
import { ContextManager } from '../context/manager.js';
import { join } from 'path';

const PROMPTS_DIR = join(__dirname, '..', 'context', 'prompts');

describe('Context Manager Integration (real API calls)', () => {
  const config = loadConfig();
  const registry = new AdapterRegistry(config);
  const cm = new ContextManager(PROMPTS_DIR);

  it('builds context for Claude → calls Anthropic → model references injected context', async () => {
    await registry.initialize();
    const adapter = registry.get('anthropic');
    if (!adapter) return;

    cm.updateState({
      contractBoard: [
        { id: 'FOS-01', name: 'Model Adapter', status: 'COMPLETE' },
        { id: 'FOS-02', name: 'Context Manager', status: 'IN_PROGRESS', builder: 'claude' },
      ],
      activeRoster: [
        { modelId: 'claude', provider: 'anthropic', status: 'building', currentTask: 'FOS-02' },
        { modelId: 'gpt', provider: 'openai', status: 'idle' },
      ],
    });

    const payload = cm.buildContext({
      modelId: 'claude',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      currentTask: {
        id: 'FOS-02',
        name: 'Context Manager',
        type: 'BUILD',
        specification: 'Build the context manager.',
        acceptanceCriteria: ['buildContext works', 'Token limits respected'],
      },
    });

    const response = await adapter.chat({
      model: 'claude-sonnet-4-20250514',
      systemPrompt: payload.systemPrompt,
      messages: [{ role: 'user', content: 'What is your current assignment? What contracts are complete? Answer in 2 sentences max.' }],
      maxTokens: 200,
      temperature: 0,
    });

    expect(response.content.toLowerCase()).toMatch(/fos-02|context manager/);
    expect(response.content.toLowerCase()).toMatch(/fos-01|complete|adapter/);
    console.log(`Claude response: "${response.content}"`);
    console.log(`System prompt tokens: ~${payload.tokenEstimate}`);
    console.log(`Layer breakdown:`, payload.layerBreakdown);
  }, 30000);

  it('builds context for GPT → calls OpenAI → model knows its role', async () => {
    await registry.initialize();
    const adapter = registry.get('openai');
    if (!adapter) return;

    const payload = cm.buildContext({
      modelId: 'gpt',
      provider: 'openai',
      model: 'gpt-4o',
    });

    const response = await adapter.chat({
      model: 'gpt-4o-mini',
      systemPrompt: payload.systemPrompt,
      messages: [{ role: 'user', content: 'What is your role in the team? Answer in 1 sentence.' }],
      maxTokens: 100,
      temperature: 0,
    });

    expect(response.content.toLowerCase()).toMatch(/govern|challeng|gpt|defensib/);
    console.log(`GPT response: "${response.content}"`);
  }, 30000);
});
