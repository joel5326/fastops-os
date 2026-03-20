import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../context/manager.js';
import { estimateTokens } from '../context/token-counter.js';
import type { Message } from '../types.js';
import { join } from 'path';

const PROMPTS_DIR = join(__dirname, '..', 'context', 'prompts');

describe('ContextManager', () => {
  let cm: ContextManager;

  beforeEach(() => {
    cm = new ContextManager(PROMPTS_DIR);
  });

  it('builds context with identity layer for known model', () => {
    const payload = cm.buildContext({
      modelId: 'claude',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    expect(payload.systemPrompt).toContain('Claude');
    expect(payload.systemPrompt).toContain('[CONTEXT STATUS]');
    expect(payload.tokenEstimate).toBeGreaterThan(0);
    expect(payload.layerBreakdown['identity']).toBeGreaterThan(0);
  });

  it('builds context with fallback identity for unknown model', () => {
    const payload = cm.buildContext({
      modelId: 'unknown-model',
      provider: 'test',
      model: 'test-model',
    });

    expect(payload.systemPrompt).toContain('unknown-model');
    expect(payload.systemPrompt).toContain('FastOps OS');
  });

  it('includes state layer when state is set', () => {
    cm.updateState({
      contractBoard: [
        { id: 'FOS-01', name: 'Model Adapter', status: 'COMPLETE' },
        { id: 'FOS-02', name: 'Context Manager', status: 'IN_PROGRESS', builder: 'claude' },
      ],
    });

    const payload = cm.buildContext({
      modelId: 'claude',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    expect(payload.systemPrompt).toContain('[ENGINE STATE]');
    expect(payload.systemPrompt).toContain('FOS-01');
    expect(payload.systemPrompt).toContain('COMPLETE');
    expect(payload.layerBreakdown['state']).toBeGreaterThan(0);
  });

  it('includes comms layer with messages', () => {
    cm.updateComms([
      { id: '1', from: 'gpt', content: 'FOS-06 build started', channel: 'general', ts: '2026-03-20T15:00:00Z' },
      { id: '2', from: 'kimi', content: 'FOS-03 QC passed', channel: 'general', ts: '2026-03-20T15:01:00Z' },
    ]);

    const payload = cm.buildContext({
      modelId: 'claude',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      includeComms: true,
    });

    expect(payload.systemPrompt).toContain('[RECENT COMMS]');
    expect(payload.systemPrompt).toContain('gpt');
    expect(payload.systemPrompt).toContain('FOS-06 build started');
  });

  it('includes task layer when contract is active', () => {
    const payload = cm.buildContext({
      modelId: 'claude',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      currentTask: {
        id: 'FOS-02',
        name: 'Context Manager',
        type: 'BUILD',
        specification: 'Build the context manager that assembles layered context.',
        acceptanceCriteria: ['buildContext returns valid payload', 'Token limit respected'],
      },
    });

    expect(payload.systemPrompt).toContain('[ACTIVE CONTRACT: FOS-02]');
    expect(payload.systemPrompt).toContain('Context Manager');
    expect(payload.layerBreakdown['task']).toBeGreaterThan(0);
  });

  it('includes KB layer when query matches', () => {
    cm.updateKB([
      { id: 'W-036', content: 'Contracts that compile can fail at runtime.', tags: ['testing', 'runtime'], severity: 'warning' },
      { id: 'W-153', content: 'Satisfaction inversely correlates with quality.', tags: ['quality', 'qc'], severity: 'critical' },
      { id: 'W-999', content: 'Unrelated entry about deployment.', tags: ['deploy'], severity: 'info' },
    ]);

    const payload = cm.buildContext({
      modelId: 'claude',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      kbQuery: 'testing runtime compile',
    });

    expect(payload.systemPrompt).toContain('[KNOWLEDGE BASE');
    expect(payload.systemPrompt).toContain('W-036');
  });

  it('respects token limit — layers 1-2 are never trimmed', () => {
    cm.updateKB(Array.from({ length: 50 }, (_, i) => ({
      id: `KB-${i}`,
      content: 'x'.repeat(1000),
      tags: ['test'],
    })));

    const payload = cm.buildContext({
      modelId: 'claude',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 2000,
      kbQuery: 'test',
    });

    expect(payload.systemPrompt).toContain('[CONTEXT STATUS]');
    expect(payload.tokenEstimate).toBeLessThanOrEqual(2000);
  });

  it('context status shows accurate token counts', () => {
    const history: Message[] = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      content: `Message ${i}: ${'word '.repeat(50)}`,
    }));

    const payload = cm.buildContext(
      {
        modelId: 'claude',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      },
      history,
    );

    expect(payload.systemPrompt).toContain('Messages in history: 10');
  });

  it('detects compaction request in model output', () => {
    expect(cm.detectCompactionRequest('Sure, I can help. [REQUEST: COMPACT NOW]')).toBe(true);
    expect(cm.detectCompactionRequest('Normal response')).toBe(false);
  });

  it('checkCompactionThresholds returns null when under 60%', async () => {
    const history: Message[] = [{ role: 'user', content: 'hello' }];
    const result = await cm.checkCompactionThresholds(history, 'claude-sonnet-4-20250514');
    expect(result).toBeNull();
  });

  it('scales comms window for large-context models (Gemini)', () => {
    cm.updateComms(Array.from({ length: 30 }, (_, i) => ({
      id: `${i}`,
      from: 'test',
      content: `Message ${i}`,
      channel: 'general',
      ts: new Date(Date.now() + i * 1000).toISOString(),
    })));

    const geminiPayload = cm.buildContext({
      modelId: 'gemini',
      provider: 'google',
      model: 'gemini-2.5-pro-preview-05-06',
      includeComms: true,
      commsWindow: 30,
    });

    const claudePayload = cm.buildContext({
      modelId: 'claude',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      includeComms: true,
      commsWindow: 20,
    });

    const geminiCommsTokens = geminiPayload.layerBreakdown['comms'] ?? 0;
    const claudeCommsTokens = claudePayload.layerBreakdown['comms'] ?? 0;
    expect(geminiCommsTokens).toBeGreaterThanOrEqual(claudeCommsTokens);
  });
});
