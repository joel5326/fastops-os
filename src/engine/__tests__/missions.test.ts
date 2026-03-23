import { describe, it, expect } from 'vitest';
import { buildMissionLayer, type MissionState } from '../context/layers/missions.js';

describe('buildMissionLayer', () => {
  it('returns empty for no missions', () => {
    const result = buildMissionLayer([], { currentModelId: 'claude' });
    expect(result.text).toBe('');
    expect(result.tokens).toBe(0);
    expect(result.totalMissions).toBe(0);
  });

  it('groups missions by status: blocked, in_progress, open', () => {
    const missions: MissionState[] = [
      { id: 'm1', name: 'Auth system', status: 'blocked', priority: 'critical', blockedBy: 'Kimi' },
      { id: 'm2', name: 'Dashboard', status: 'in_progress', priority: 'high', owner: 'claude' },
      { id: 'm3', name: 'Analytics', status: 'open', priority: 'medium' },
    ];

    const result = buildMissionLayer(missions, { currentModelId: 'claude' });

    expect(result.text).toContain('BLOCKED:');
    expect(result.text).toContain('Auth system');
    expect(result.text).toContain('blocked by Kimi');
    expect(result.text).toContain('In Progress:');
    expect(result.text).toContain('Dashboard');
    expect(result.text).toContain('Open:');
    expect(result.text).toContain('Analytics');
  });

  it('marks current model missions with (yours)', () => {
    const missions: MissionState[] = [
      { id: 'm1', name: 'My task', status: 'in_progress', priority: 'high', owner: 'claude' },
      { id: 'm2', name: 'Their task', status: 'in_progress', priority: 'high', owner: 'gpt' },
    ];

    const result = buildMissionLayer(missions, { currentModelId: 'claude' });

    expect(result.text).toContain('(yours)');
    expect(result.text.match(/\(yours\)/g)).toHaveLength(1);
  });

  it('shows progress percentage', () => {
    const missions: MissionState[] = [
      { id: 'm1', name: 'Build it', status: 'in_progress', priority: 'high', owner: 'claude', progress: 0.65 },
    ];

    const result = buildMissionLayer(missions, { currentModelId: 'claude' });

    expect(result.text).toContain('65%');
  });

  it('sorts by priority then status', () => {
    const missions: MissionState[] = [
      { id: 'm1', name: 'Low open', status: 'open', priority: 'low' },
      { id: 'm2', name: 'Critical blocked', status: 'blocked', priority: 'critical' },
      { id: 'm3', name: 'High active', status: 'in_progress', priority: 'high' },
    ];

    const result = buildMissionLayer(missions, { currentModelId: 'claude' });

    const blockedIdx = result.text.indexOf('Critical blocked');
    const activeIdx = result.text.indexOf('High active');
    const openIdx = result.text.indexOf('Low open');

    expect(blockedIdx).toBeLessThan(activeIdx);
    expect(activeIdx).toBeLessThan(openIdx);
  });

  it('hides completed missions when opted in', () => {
    const missions: MissionState[] = [
      { id: 'm1', name: 'Done thing', status: 'complete', priority: 'medium' },
      { id: 'm2', name: 'Active thing', status: 'in_progress', priority: 'high', owner: 'claude' },
    ];

    const result = buildMissionLayer(missions, {
      currentModelId: 'claude',
      hideCompleted: true,
    });

    expect(result.text).not.toContain('Done thing');
    expect(result.text).toContain('Active thing');
  });

  it('shows completed count when not hiding', () => {
    const missions: MissionState[] = [
      { id: 'm1', name: 'Done 1', status: 'complete', priority: 'medium' },
      { id: 'm2', name: 'Done 2', status: 'complete', priority: 'medium' },
    ];

    const result = buildMissionLayer(missions, {
      currentModelId: 'claude',
      hideCompleted: false,
    });

    expect(result.text).toContain('Completed: 2 missions');
  });

  it('respects maxTokens', () => {
    const missions: MissionState[] = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      name: `Very long mission name that takes up tokens number ${i}`,
      status: 'open' as const,
      priority: 'medium' as const,
    }));

    const result = buildMissionLayer(missions, {
      currentModelId: 'claude',
      maxTokens: 50,
    });

    expect(result.tokens).toBeLessThanOrEqual(50);
  });

  it('counts blocked missions correctly', () => {
    const missions: MissionState[] = [
      { id: 'm1', name: 'Blocked 1', status: 'blocked', priority: 'high' },
      { id: 'm2', name: 'Blocked 2', status: 'blocked', priority: 'critical' },
      { id: 'm3', name: 'Active', status: 'in_progress', priority: 'high' },
    ];

    const result = buildMissionLayer(missions, { currentModelId: 'claude' });

    expect(result.blockedMissions).toBe(2);
    expect(result.activeMissions).toBe(1);
    expect(result.totalMissions).toBe(3);
  });

  it('shows priority in uppercase', () => {
    const missions: MissionState[] = [
      { id: 'm1', name: 'Task', status: 'open', priority: 'critical' },
    ];

    const result = buildMissionLayer(missions, { currentModelId: 'claude' });

    expect(result.text).toContain('[CRITICAL]');
  });
});
