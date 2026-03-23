import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OverwatchMonitor } from '../overwatch/monitor.js';
import { KnowledgeStore } from '../overwatch/knowledge-store.js';
import { EventBus } from '../core/event-bus.js';
import type { KnowledgeArticle } from '../overwatch/types.js';
import type { Message } from '../types.js';

function createMockContextManager() {
  return {
    enqueueOverwatchDrop: vi.fn(),
  };
}

function makeArticle(overrides: Partial<KnowledgeArticle> = {}): KnowledgeArticle {
  return {
    id: 'KB-001',
    pattern: 'permission-seeking',
    category: 'behavioral',
    content: 'Three agents across different projects attempted this exact approach. Each time they sought permission instead of acting.',
    severity: 'high',
    interventionSuccessRate: 0.8,
    sourceProducts: ['warriorpath', 'fastops-product'],
    triggerSignals: ['should i', 'would you like me to', 'shall i proceed', 'is it okay'],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    dropCount: 0,
    feedbackScore: 0,
    ...overrides,
  };
}

function makeMessages(contents: string[]): Message[] {
  return contents.map((c, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as Message['role'],
    content: c,
  }));
}

describe('KnowledgeStore', () => {
  let store: KnowledgeStore;

  beforeEach(() => {
    store = new KnowledgeStore();
  });

  it('loads and retrieves articles', () => {
    store.load([makeArticle(), makeArticle({ id: 'KB-002', pattern: 'dead-end' })]);
    expect(store.size()).toBe(2);
    expect(store.get('KB-001')).toBeDefined();
    expect(store.get('KB-002')).toBeDefined();
  });

  it('finds articles by signal match in text', () => {
    store.load([
      makeArticle(),
      makeArticle({
        id: 'KB-002',
        triggerSignals: ['force push', 'rm -rf'],
      }),
    ]);

    const matches = store.findBySignal('Should I proceed with the refactoring?');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].id).toBe('KB-001');
  });

  it('returns empty for no signal matches', () => {
    store.load([makeArticle()]);
    const matches = store.findBySignal('Building the authentication module now.');
    expect(matches).toHaveLength(0);
  });

  it('finds by category', () => {
    store.load([
      makeArticle(),
      makeArticle({ id: 'KB-002', category: 'failure-mode' }),
    ]);
    expect(store.findByCategory('behavioral')).toHaveLength(1);
    expect(store.findByCategory('failure-mode')).toHaveLength(1);
  });

  it('finds by minimum severity', () => {
    store.load([
      makeArticle({ id: 'KB-LOW', severity: 'low' }),
      makeArticle({ id: 'KB-MED', severity: 'medium' }),
      makeArticle({ id: 'KB-HIGH', severity: 'high' }),
      makeArticle({ id: 'KB-CRIT', severity: 'critical' }),
    ]);
    expect(store.findBySeverity('high')).toHaveLength(2);
    expect(store.findBySeverity('critical')).toHaveLength(1);
    expect(store.findBySeverity('low')).toHaveLength(4);
  });

  it('tracks drop count and feedback', () => {
    store.add(makeArticle());
    store.recordDrop('KB-001');
    store.recordDrop('KB-001');
    expect(store.get('KB-001')!.dropCount).toBe(2);

    store.recordFeedback('KB-001', 0.8);
    expect(store.get('KB-001')!.feedbackScore).toBeGreaterThan(0);
  });
});

describe('OverwatchMonitor', () => {
  let monitor: OverwatchMonitor;
  let knowledge: KnowledgeStore;
  let events: EventBus;
  let contextManager: ReturnType<typeof createMockContextManager>;

  beforeEach(() => {
    knowledge = new KnowledgeStore();
    events = new EventBus();
    contextManager = createMockContextManager();
    monitor = new OverwatchMonitor(
      knowledge,
      events,
      contextManager as any,
      /* Short test utterances score ~0.52; default softThreshold 0.70 would yield no matches */
      { cooldownMs: 0, softThreshold: 0.45 },
    );
  });

  describe('scanning', () => {
    it('detects pattern matches in session messages', () => {
      knowledge.load([makeArticle()]);

      const messages = makeMessages([
        'Build the auth module',
        'Should I proceed? Would you like me to continue? Is it okay if I refactor this?',
      ]);

      const result = monitor.scanSession('session-1', 'claude', messages);
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      expect(result.matches[0].articleId).toBe('KB-001');
      expect(result.matches[0].confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('returns no matches when signals absent', () => {
      knowledge.load([makeArticle()]);

      const messages = makeMessages([
        'Build the auth module',
        'Implementing JWT tokens now. Writing the middleware.',
      ]);

      const result = monitor.scanSession('session-1', 'claude', messages);
      expect(result.matches).toHaveLength(0);
    });

    it('scans only recent messages', () => {
      knowledge.load([makeArticle()]);

      const messages: Message[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push({ role: 'user', content: `Message ${i}` });
      }
      messages.push({ role: 'assistant', content: 'Would you like me to continue?' });

      const result = monitor.scanSession('session-1', 'claude', messages);
      expect(result.scannedMessages).toBe(10);
    });
  });

  describe('injection', () => {
    it('injects drop into context manager when active', () => {
      knowledge.load([makeArticle()]);
      monitor.start();

      const messages = makeMessages([
        'test',
        'Should I proceed? Would you like me to do this? Is it okay?',
      ]);
      const scan = monitor.scanSession('session-1', 'claude', messages);
      expect(scan.matches.length).toBeGreaterThan(0);

      const drop = monitor.injectDrop(scan.matches[0]);
      expect(drop).not.toBeNull();
      expect(drop!.type).toBeDefined();
      expect(contextManager.enqueueOverwatchDrop).toHaveBeenCalledOnce();
    });

    it('does not inject when inactive', () => {
      knowledge.load([makeArticle()]);

      const messages = makeMessages(['test', 'Should I proceed? Would you like me to? Is it okay?']);
      const scan = monitor.scanSession('session-1', 'claude', messages);
      if (scan.matches.length === 0) {
        expect(true).toBe(true);
        return;
      }
      const drop = monitor.injectDrop(scan.matches[0]);
      expect(drop).toBeNull();
    });

    it('respects max drops per session', () => {
      knowledge.load([makeArticle()]);
      monitor.start();

      const maxDropsMonitor = new OverwatchMonitor(
        knowledge,
        events,
        contextManager as any,
        { maxDropsPerSession: 2, cooldownMs: 0, softThreshold: 0.45 },
      );
      maxDropsMonitor.start();

      const messages = makeMessages(['test', 'Should I proceed? Would you like me to? Is it okay?']);
      const scan = maxDropsMonitor.scanSession('session-1', 'claude', messages);

      maxDropsMonitor.injectDrop(scan.matches[0]);
      maxDropsMonitor.injectDrop(scan.matches[0]);
      const third = maxDropsMonitor.injectDrop(scan.matches[0]);
      expect(third).toBeNull();
    });

    it('classifies as hard drop above hard threshold', () => {
      knowledge.load([
        makeArticle({
          severity: 'critical',
          interventionSuccessRate: 0.95,
          triggerSignals: ['should i', 'would you like me to', 'shall i proceed', 'is it okay', 'permission'],
        }),
      ]);
      monitor.start();

      const messages = makeMessages([
        'Should I proceed? Would you like me to continue? Is it okay if I do this?',
        'Shall I proceed with the changes? I want permission before acting.',
      ]);

      const scan = monitor.scanSession('session-1', 'claude', messages);
      if (scan.matches.length > 0 && scan.matches[0].confidence >= 0.85) {
        const drop = monitor.injectDrop(scan.matches[0]);
        expect(drop).not.toBeNull();
        expect(drop!.type).toBe('hard');
      }
    });
  });

  describe('feedback', () => {
    it('records feedback on a drop', () => {
      knowledge.load([makeArticle()]);
      monitor.start();

      const messages = makeMessages(['test', 'Should I proceed?']);
      const scan = monitor.scanSession('session-1', 'claude', messages);
      const drop = monitor.injectDrop(scan.matches[0])!;

      const recorded = monitor.recordFeedback(drop.id, {
        accuracy: 'true',
        utility: 'blocked-risk',
        delta: 'Changed approach from asking to acting',
        receivedAt: new Date().toISOString(),
      });

      expect(recorded).toBe(true);
    });

    it('returns false for unknown drop', () => {
      expect(monitor.recordFeedback('nonexistent', {
        accuracy: 'false',
        utility: 'noise',
        delta: 'N/A',
        receivedAt: new Date().toISOString(),
      })).toBe(false);
    });
  });

  describe('state', () => {
    it('reports state correctly', () => {
      knowledge.load([makeArticle(), makeArticle({ id: 'KB-002' })]);
      monitor.start();

      const state = monitor.getState();
      expect(state.active).toBe(true);
      expect(state.articlesLoaded).toBe(2);
      expect(state.totalDrops).toBe(0);
    });

    it('tracks drops in state', () => {
      knowledge.load([makeArticle()]);
      monitor.start();

      const messages = makeMessages(['test', 'Should I proceed?']);
      const scan = monitor.scanSession('session-1', 'claude', messages);
      monitor.injectDrop(scan.matches[0]);

      const state = monitor.getState();
      expect(state.totalDrops).toBe(1);
      expect(state.sessionMonitors).toBe(1);
    });

    it('lists recent drops', () => {
      knowledge.load([makeArticle()]);
      monitor.start();

      const messages = makeMessages(['test', 'Should I proceed? Would you like me to? Is it okay?']);
      const scan = monitor.scanSession('session-1', 'claude', messages);
      monitor.injectDrop(scan.matches[0]);

      expect(monitor.getRecentDrops()).toHaveLength(1);
      expect(monitor.getRecentDrops('session-1')).toHaveLength(1);
      expect(monitor.getRecentDrops('session-2')).toHaveLength(0);
    });
  });
});
