import { describe, it, expect } from 'vitest';
import { buildTeamAwarenessLayer, type TeamMemberStatus } from '../context/layers/team-awareness.js';

describe('buildTeamAwarenessLayer', () => {
  it('returns empty for no members', () => {
    const result = buildTeamAwarenessLayer([], { currentModelId: 'claude' });
    expect(result.text).toBe('');
    expect(result.tokens).toBe(0);
    expect(result.memberCount).toBe(0);
    expect(result.activeCount).toBe(0);
  });

  it('groups members by status', () => {
    const members: TeamMemberStatus[] = [
      { modelId: 'claude', provider: 'anthropic', status: 'building', currentTask: 'Phase 2.2' },
      { modelId: 'gpt', provider: 'openai', status: 'idle', lastDeliverable: 'policy store' },
      { modelId: 'gemini', provider: 'google', status: 'offline' },
    ];

    const result = buildTeamAwarenessLayer(members, { currentModelId: 'claude' });

    expect(result.text).toContain('Active:');
    expect(result.text).toContain('claude (you): building');
    expect(result.text).toContain('Idle:');
    expect(result.text).toContain('gpt: idle');
    expect(result.text).toContain('Offline:');
    expect(result.text).toContain('gemini');
    expect(result.memberCount).toBe(3);
    expect(result.activeCount).toBe(1);
  });

  it('marks current model with (you)', () => {
    const members: TeamMemberStatus[] = [
      { modelId: 'claude', provider: 'anthropic', status: 'building' },
      { modelId: 'gpt', provider: 'openai', status: 'building' },
    ];

    const result = buildTeamAwarenessLayer(members, { currentModelId: 'claude' });

    expect(result.text).toContain('claude (you)');
    expect(result.text).not.toContain('gpt (you)');
  });

  it('includes current task when present', () => {
    const members: TeamMemberStatus[] = [
      { modelId: 'claude', provider: 'anthropic', status: 'building', currentTask: 'Phase 3.1' },
    ];

    const result = buildTeamAwarenessLayer(members, { currentModelId: 'gpt' });

    expect(result.text).toContain('Phase 3.1');
  });

  it('includes phase when opted in', () => {
    const members: TeamMemberStatus[] = [
      { modelId: 'claude', provider: 'anthropic', status: 'building', phase: 'P2' },
    ];

    const result = buildTeamAwarenessLayer(members, {
      currentModelId: 'gpt',
      includePhase: true,
    });

    expect(result.text).toContain('[P2]');
  });

  it('does not include phase when opted out', () => {
    const members: TeamMemberStatus[] = [
      { modelId: 'claude', provider: 'anthropic', status: 'building', phase: 'P2' },
    ];

    const result = buildTeamAwarenessLayer(members, {
      currentModelId: 'gpt',
      includePhase: false,
    });

    expect(result.text).not.toContain('[P2]');
  });

  it('includes context usage when opted in', () => {
    const members: TeamMemberStatus[] = [
      { modelId: 'claude', provider: 'anthropic', status: 'building', contextUsage: 0.73 },
    ];

    const result = buildTeamAwarenessLayer(members, {
      currentModelId: 'gpt',
      includeContextUsage: true,
    });

    expect(result.text).toContain('73% context');
  });

  it('shows last deliverable for idle models', () => {
    const members: TeamMemberStatus[] = [
      { modelId: 'gpt', provider: 'openai', status: 'idle', lastDeliverable: 'policy store' },
    ];

    const result = buildTeamAwarenessLayer(members, { currentModelId: 'claude' });

    expect(result.text).toContain('last shipped: policy store');
  });

  it('shows compacting status', () => {
    const members: TeamMemberStatus[] = [
      { modelId: 'kimi', provider: 'moonshot', status: 'compacting' },
    ];

    const result = buildTeamAwarenessLayer(members, { currentModelId: 'claude' });

    expect(result.text).toContain('kimi (compacting)');
  });

  it('warns about non-onboarded members', () => {
    const members: TeamMemberStatus[] = [
      { modelId: 'claude', provider: 'anthropic', status: 'building', onboarded: true },
      { modelId: 'newbie', provider: 'openai', status: 'online', onboarded: false },
    ];

    const result = buildTeamAwarenessLayer(members, { currentModelId: 'claude' });

    expect(result.text).toContain('Not onboarded: newbie');
  });

  it('respects maxTokens', () => {
    const members: TeamMemberStatus[] = Array.from({ length: 20 }, (_, i) => ({
      modelId: `model-${i}`,
      provider: 'test',
      status: 'building' as const,
      currentTask: `Very long task description that takes up many tokens for model ${i}`,
    }));

    const result = buildTeamAwarenessLayer(members, {
      currentModelId: 'model-0',
      maxTokens: 50,
    });

    expect(result.tokens).toBeLessThanOrEqual(50);
  });

  it('counts active members correctly', () => {
    const members: TeamMemberStatus[] = [
      { modelId: 'a', provider: 'x', status: 'building' },
      { modelId: 'b', provider: 'x', status: 'qc' },
      { modelId: 'c', provider: 'x', status: 'online' },
      { modelId: 'd', provider: 'x', status: 'idle' },
      { modelId: 'e', provider: 'x', status: 'offline' },
    ];

    const result = buildTeamAwarenessLayer(members, { currentModelId: 'a' });

    expect(result.activeCount).toBe(3);
    expect(result.memberCount).toBe(5);
  });
});
