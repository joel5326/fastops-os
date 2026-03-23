import { describe, it, expect } from 'vitest';
import { CompactionBroadcaster } from '../context/compaction-broadcast.js';
import { ContextManager } from '../context/manager.js';
import { EventBus } from '../core/event-bus.js';

function createBroadcaster() {
  const events = new EventBus();
  const contextManager = new ContextManager();
  const broadcaster = new CompactionBroadcaster(events, contextManager);
  return { events, contextManager, broadcaster };
}

describe('CompactionBroadcaster', () => {
  it('wires and unwires without error', () => {
    const { broadcaster } = createBroadcaster();
    broadcaster.wire();
    broadcaster.unwire();
  });

  it('captures compaction.checkpoint events', () => {
    const { events, broadcaster } = createBroadcaster();
    broadcaster.wire();

    const broadcasts: unknown[] = [];
    events.on('compaction.broadcast', (d) => broadcasts.push(d));

    events.emit('compaction.checkpoint', {
      sessionId: 'sess-1',
      modelId: 'claude',
      contextUsage: 0.6,
    });

    expect(broadcasts).toHaveLength(1);
    const alert = broadcasts[0] as Record<string, unknown>;
    expect(alert.modelId).toBe('claude');
    expect(alert.threshold).toBe('checkpoint');
    expect(alert.contextUsage).toBe(0.6);
  });

  it('captures compaction.summarize events', () => {
    const { events, broadcaster } = createBroadcaster();
    broadcaster.wire();

    events.emit('compaction.summarize', {
      sessionId: 'sess-1',
      modelId: 'gpt',
      contextUsage: 0.75,
    });

    expect(broadcaster.getAlerts()).toHaveLength(1);
    expect(broadcaster.getAlerts()[0].threshold).toBe('summarize');
  });

  it('captures compaction.handoff events', () => {
    const { events, broadcaster } = createBroadcaster();
    broadcaster.wire();

    events.emit('compaction.handoff', {
      sessionId: 'sess-1',
      modelId: 'gemini',
      contextUsage: 0.9,
    });

    expect(broadcaster.getAlerts()[0].threshold).toBe('handoff');
  });

  it('captures compaction.hard_stop events', () => {
    const { events, broadcaster } = createBroadcaster();
    broadcaster.wire();

    events.emit('compaction.hard_stop', {
      sessionId: 'sess-1',
      modelId: 'kimi',
      contextUsage: 0.95,
    });

    expect(broadcaster.getAlerts()[0].threshold).toBe('hard_stop');
  });

  it('captures compaction.started events', () => {
    const { events, broadcaster } = createBroadcaster();
    broadcaster.wire();

    events.emit('compaction.started', {
      sessionId: 'sess-1',
      modelId: 'claude',
    });

    expect(broadcaster.getAlerts()[0].threshold).toBe('compacting');
  });

  it('computes usage from tokensUsed/tokensMax when contextUsage not provided', () => {
    const { events, broadcaster } = createBroadcaster();
    broadcaster.wire();

    events.emit('compaction.checkpoint', {
      sessionId: 'sess-1',
      modelId: 'claude',
      tokensUsed: 120000,
      tokensMax: 200000,
    });

    expect(broadcaster.getAlerts()[0].contextUsage).toBe(0.6);
  });

  it('getModelAlert returns latest alert for model', () => {
    const { events, broadcaster } = createBroadcaster();
    broadcaster.wire();

    events.emit('compaction.checkpoint', {
      sessionId: 'sess-1',
      modelId: 'claude',
      contextUsage: 0.6,
    });
    events.emit('compaction.summarize', {
      sessionId: 'sess-1',
      modelId: 'claude',
      contextUsage: 0.75,
    });

    const alert = broadcaster.getModelAlert('claude');
    expect(alert).toBeDefined();
    expect(alert!.threshold).toBe('summarize');
    expect(alert!.contextUsage).toBe(0.75);
  });

  it('getModelAlert returns undefined for unknown model', () => {
    const { broadcaster } = createBroadcaster();
    expect(broadcaster.getModelAlert('nonexistent')).toBeUndefined();
  });

  it('getAlerts returns a copy', () => {
    const { broadcaster } = createBroadcaster();
    const h1 = broadcaster.getAlerts();
    h1.push({} as never);
    expect(broadcaster.getAlerts()).toHaveLength(0);
  });

  it('clearAlerts removes all alerts', () => {
    const { events, broadcaster } = createBroadcaster();
    broadcaster.wire();

    events.emit('compaction.checkpoint', {
      sessionId: 'sess-1',
      modelId: 'claude',
      contextUsage: 0.6,
    });

    expect(broadcaster.getAlerts()).toHaveLength(1);
    broadcaster.clearAlerts();
    expect(broadcaster.getAlerts()).toHaveLength(0);
  });

  it('unwire stops capturing events', () => {
    const { events, broadcaster } = createBroadcaster();
    broadcaster.wire();
    broadcaster.unwire();

    events.emit('compaction.checkpoint', {
      sessionId: 'sess-1',
      modelId: 'claude',
      contextUsage: 0.6,
    });

    expect(broadcaster.getAlerts()).toHaveLength(0);
  });

  it('getRecentAlerts filters by time window', () => {
    const { events, broadcaster } = createBroadcaster();
    broadcaster.wire();

    events.emit('compaction.checkpoint', {
      sessionId: 'sess-1',
      modelId: 'claude',
      contextUsage: 0.6,
    });

    const recent = broadcaster.getRecentAlerts(60_000);
    expect(recent).toHaveLength(1);

    const old = broadcaster.getRecentAlerts(-1);
    expect(old).toHaveLength(0);
  });
});
