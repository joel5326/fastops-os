import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubagentManager } from '../subagents/manager.js';
import { EventBus } from '../core/event-bus.js';
import type { SubagentConfig } from '../subagents/types.js';

function createMockSessions() {
  let counter = 0;
  const closed = new Set<string>();
  return {
    create: vi.fn(() => {
      const id = `session-${++counter}`;
      return {
        id,
        modelId: 'test',
        provider: 'test',
        status: 'working' as const,
        messages: [],
        createdAt: new Date(),
        lastActiveAt: new Date(),
        tokensBurned: 0,
        costAccumulated: 0,
      };
    }),
    get: vi.fn(),
    list: vi.fn(() => []),
    close: vi.fn((id: string) => {
      if (closed.has(id)) throw new Error('already closed');
      closed.add(id);
    }),
    closed,
  };
}

function createMockComms() {
  const messages: Array<{ from: string; channel: string; content: string }> = [];
  return {
    send: vi.fn((msg: { from: string; channel: string; content: string }) => {
      messages.push(msg);
      return { ...msg, id: `msg-${messages.length}`, ts: new Date() };
    }),
    getHistory: vi.fn(() => []),
    listChannels: vi.fn(() => ['general']),
    messages,
  };
}

function makeConfig(overrides: Partial<SubagentConfig> = {}): SubagentConfig {
  return {
    callsign: 'builder-1',
    type: 'build',
    persistence: 'persistent',
    parentSessionId: 'parent-session-1',
    parentModelId: 'claude',
    modelId: 'anthropic',
    ...overrides,
  };
}

describe('SubagentManager', () => {
  let manager: SubagentManager;
  let events: EventBus;
  let sessions: ReturnType<typeof createMockSessions>;
  let comms: ReturnType<typeof createMockComms>;

  beforeEach(() => {
    events = new EventBus();
    sessions = createMockSessions();
    comms = createMockComms();
    manager = new SubagentManager({
      events,
      sessions: sessions as any,
      comms: comms as any,
    });
  });

  describe('spawn', () => {
    it('creates a new subagent with a session', () => {
      const result = manager.spawn(makeConfig());

      expect(result.callsign).toBe('builder-1');
      expect(result.sessionId).toBe('session-1');
      expect(result.subagent.lifecycle).toBe('active');
      expect(result.subagent.type).toBe('build');
      expect(result.subagent.persistence).toBe('persistent');
      expect(result.subagent.parentModelId).toBe('claude');
      expect(sessions.create).toHaveBeenCalledOnce();
    });

    it('posts spawn notification to comms', () => {
      manager.spawn(makeConfig());

      expect(comms.send).toHaveBeenCalled();
      const lastMsg = comms.messages[comms.messages.length - 1];
      expect(lastMsg.content).toContain('builder-1');
      expect(lastMsg.content).toContain('ACTIVE');
    });

    it('emits subagent.spawned event', () => {
      const spy = vi.fn();
      events.on('subagent.spawned', spy);

      manager.spawn(makeConfig());

      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0]).toMatchObject({
        callsign: 'builder-1',
        type: 'build',
      });
    });

    it('rejects duplicate active callsigns', () => {
      manager.spawn(makeConfig());
      expect(() => manager.spawn(makeConfig())).toThrow('already in use');
    });

    it('allows reuse of terminated callsigns', () => {
      manager.spawn(makeConfig());
      manager.terminate('builder-1');
      expect(() => manager.spawn(makeConfig())).not.toThrow();
    });
  });

  describe('lifecycle', () => {
    it('transitions active -> idle -> active via wake', () => {
      manager.spawn(makeConfig());

      const idled = manager.goIdle('builder-1');
      expect(idled!.lifecycle).toBe('idle');

      const woken = manager.wake('builder-1');
      expect(woken!.lifecycle).toBe('active');
    });

    it('ephemeral subagents terminate on goIdle', () => {
      manager.spawn(makeConfig({ persistence: 'ephemeral' }));

      const result = manager.goIdle('builder-1');
      expect(result!.lifecycle).toBe('terminated');
    });

    it('terminate sets lifecycle and terminatedAt and closes session', () => {
      const { sessionId } = manager.spawn(makeConfig());

      const terminated = manager.terminate('builder-1');
      expect(terminated!.lifecycle).toBe('terminated');
      expect(terminated!.terminatedAt).toBeDefined();
      expect(sessions.close).toHaveBeenCalledWith(sessionId);
    });

    it('cannot wake a terminated subagent', () => {
      manager.spawn(makeConfig());
      manager.terminate('builder-1');

      expect(manager.wake('builder-1')).toBeNull();
    });

    it('wake on already-active subagent returns it without emitting events', () => {
      manager.spawn(makeConfig());
      const spy = vi.fn();
      events.on('subagent.woke', spy);

      const result = manager.wake('builder-1');
      expect(result).not.toBeNull();
      expect(result!.lifecycle).toBe('active');
      expect(spy).not.toHaveBeenCalled();
    });

    it('double-terminate is idempotent', () => {
      manager.spawn(makeConfig());
      const first = manager.terminate('builder-1');
      const second = manager.terminate('builder-1');

      expect(first!.lifecycle).toBe('terminated');
      expect(second!.lifecycle).toBe('terminated');
      expect(first!.terminatedAt).toBe(second!.terminatedAt);
    });

    it('goIdle on terminated subagent returns null', () => {
      manager.spawn(makeConfig());
      manager.terminate('builder-1');
      expect(manager.goIdle('builder-1')).toBeNull();
    });

    it('markActive increments tool call count', () => {
      manager.spawn(makeConfig());
      manager.markActive('builder-1');
      manager.markActive('builder-1');
      manager.markActive('builder-1');

      const sub = manager.getByCallsign('builder-1');
      expect(sub!.toolCallCount).toBe(3);
    });

    it('recordTrace increments trace entries', () => {
      manager.spawn(makeConfig());
      manager.recordTrace('builder-1');
      manager.recordTrace('builder-1');

      const sub = manager.getByCallsign('builder-1');
      expect(sub!.traceEntries).toBe(2);
    });

    it('shutdown terminates all active subagents and closes sessions', () => {
      const { sessionId: id1 } = manager.spawn(makeConfig({ callsign: 'a1' }));
      const { sessionId: id2 } = manager.spawn(makeConfig({ callsign: 'a2' }));
      
      manager.shutdown();
      
      const sub1 = manager.getByCallsign('a1');
      const sub2 = manager.getByCallsign('a2');
      
      expect(sub1!.lifecycle).toBe('terminated');
      expect(sub2!.lifecycle).toBe('terminated');
      expect(sessions.close).toHaveBeenCalledWith(id1);
      expect(sessions.close).toHaveBeenCalledWith(id2);
    });
  });

  describe('messaging', () => {
    it('routes messages to subagent via comms', () => {
      manager.spawn(makeConfig());

      const sent = manager.sendMessage({
        from: 'claude',
        to: 'builder-1',
        content: 'Stop current approach. Use method B.',
        type: 'redirect',
        ts: new Date().toISOString(),
      });

      expect(sent).toBe(true);
      const lastMsg = comms.messages[comms.messages.length - 1];
      expect(lastMsg.content).toContain('@builder-1');
      expect(lastMsg.content).toContain('method B');
    });

    it('returns false for unknown callsign', () => {
      const sent = manager.sendMessage({
        from: 'claude',
        to: 'ghost',
        content: 'hello',
        type: 'task',
        ts: new Date().toISOString(),
      });
      expect(sent).toBe(false);
    });

    it('returns false for terminated subagent', () => {
      manager.spawn(makeConfig());
      manager.terminate('builder-1');

      const sent = manager.sendMessage({
        from: 'claude',
        to: 'builder-1',
        content: 'hello',
        type: 'task',
        ts: new Date().toISOString(),
      });
      expect(sent).toBe(false);
    });

    it('wake message wakes idle subagent', () => {
      manager.spawn(makeConfig());
      manager.goIdle('builder-1');

      expect(manager.getByCallsign('builder-1')!.lifecycle).toBe('idle');

      manager.sendMessage({
        from: 'claude',
        to: 'builder-1',
        content: 'wake up and QC this',
        type: 'wake',
        ts: new Date().toISOString(),
      });

      expect(manager.getByCallsign('builder-1')!.lifecycle).toBe('active');
    });
  });

  describe('queries', () => {
    it('lists all subagents', () => {
      manager.spawn(makeConfig({ callsign: 'a' }));
      manager.spawn(makeConfig({ callsign: 'b' }));
      manager.spawn(makeConfig({ callsign: 'c' }));

      expect(manager.listAll()).toHaveLength(3);
    });

    it('lists active subagents', () => {
      manager.spawn(makeConfig({ callsign: 'a' }));
      manager.spawn(makeConfig({ callsign: 'b' }));
      manager.terminate('b');

      expect(manager.listActive()).toHaveLength(1);
      expect(manager.listActive()[0].callsign).toBe('a');
    });

    it('lists by parent', () => {
      manager.spawn(makeConfig({ callsign: 'a', parentSessionId: 'p1' }));
      manager.spawn(makeConfig({ callsign: 'b', parentSessionId: 'p2' }));

      expect(manager.listByParent('p1')).toHaveLength(1);
      expect(manager.listByParent('p1')[0].callsign).toBe('a');
    });

    it('lists by product', () => {
      manager.spawn(makeConfig({ callsign: 'a', productId: 'warriorpath' }));
      manager.spawn(makeConfig({ callsign: 'b', productId: 'fastops' }));

      expect(manager.listByProduct('warriorpath')).toHaveLength(1);
    });

    it('builds callsign map excluding terminated', () => {
      manager.spawn(makeConfig({ callsign: 'live' }));
      manager.spawn(makeConfig({ callsign: 'dead' }));
      manager.terminate('dead');

      const map = manager.getCallsignMap();
      expect(map.size).toBe(1);
      expect(map.has('live')).toBe(true);
      expect(map.has('dead')).toBe(false);
    });
  });

  describe('session cleanup', () => {
    it('closes underlying session on terminate', () => {
      manager.spawn(makeConfig());
      manager.terminate('builder-1');

      expect(sessions.close).toHaveBeenCalledWith('session-1');
    });

    it('handles already-closed session gracefully', () => {
      manager.spawn(makeConfig());
      sessions.closed.add('session-1');
      expect(() => manager.terminate('builder-1')).not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('terminates all subagents', () => {
      manager.spawn(makeConfig({ callsign: 'a' }));
      manager.spawn(makeConfig({ callsign: 'b' }));

      manager.shutdown();

      expect(manager.getByCallsign('a')!.lifecycle).toBe('terminated');
      expect(manager.getByCallsign('b')!.lifecycle).toBe('terminated');
    });
  });
});
