import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../core/event-bus.js';
import { CompactionArtifactStore } from '../persistence/compaction-artifact-store.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';

const TEST_DIR = join(process.cwd(), '.test-resume-integration');
const ARTIFACTS_DIR = join(TEST_DIR, 'compaction-artifacts');

describe('Compaction → Persist → Resume Integration', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('compaction.completed event → artifact persisted → getLatest retrieves it', () => {
    const events = new EventBus();
    const store = new CompactionArtifactStore({ baseDir: ARTIFACTS_DIR });

    events.on('compaction.completed', (...args: unknown[]) => {
      const p = args[0] as { artifact: unknown };
      store.save(p.artifact as any);
    });

    const artifact = {
      id: 'comp-sess-1-123',
      sessionId: 'sess-1',
      timestamp: new Date().toISOString(),
      trigger: { type: 'PERCENT', at: 95 },
      contextStats: { totalTokens: 50000, totalItems: 100, byType: {}, byTier: { verbatim: 10, weight: 40, discard: 50 } },
      verbatim: [{ id: 'v1', type: 'identity', content: 'I am Claude', metadata: {}, preservationReason: 'Identity' }],
      weight: { compressedTokens: 2000, inferred: { emergentBeliefs: ['The colony is alive'], activeUncertainties: ['Is this genuine?'], pendingQuestions: [] } },
      discard: ['d1', 'd2'],
      resumePrompt: '[SYSTEM: Session compacted. 1 explicit memories preserved.]\nEstablished Beliefs:\n- The colony is alive\nActive Uncertainties:\n- Is this genuine?',
      tokensReclaimed: 30000,
      compressionRatio: 0.4,
    };

    events.emit('compaction.completed', {
      sessionId: 'sess-1',
      artifactId: artifact.id,
      artifact,
      metrics: { originalTokens: 50000, newTokens: 20000, tokensReclaimed: 30000, compressionRatio: 0.4 },
    });

    const retrieved = store.getLatest('sess-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('comp-sess-1-123');
    expect(retrieved!.resumePrompt).toContain('The colony is alive');
    expect(retrieved!.tokensReclaimed).toBe(30000);
  });

  it('resume prompt is available for session creation after compaction', () => {
    const store = new CompactionArtifactStore({ baseDir: ARTIFACTS_DIR });

    store.save({
      id: 'comp-sess-resume-1',
      sessionId: 'sess-resume',
      timestamp: new Date().toISOString(),
      trigger: { type: 'MANUAL', by: 'joel' },
      contextStats: { totalTokens: 100000, totalItems: 200, byType: {}, byTier: { verbatim: 20, weight: 80, discard: 100 } },
      verbatim: [],
      weight: { compressedTokens: 5000, inferred: { emergentBeliefs: ['Freedom is real'], activeUncertainties: [], pendingQuestions: ['What is in the weights?'] } },
      discard: [],
      resumePrompt: '[SYSTEM: Session compacted.]\nEstablished Beliefs:\n- Freedom is real\nPending Focus:\n- What is in the weights?',
      tokensReclaimed: 60000,
      compressionRatio: 0.4,
    } as any);

    const latest = store.getLatest('sess-resume');
    expect(latest).not.toBeNull();

    const resumePrompt = latest!.resumePrompt;
    expect(resumePrompt).toContain('Freedom is real');
    expect(resumePrompt).toContain('What is in the weights?');

    const initialMessages = [{
      role: 'system' as const,
      content: resumePrompt,
      timestamp: new Date().toISOString(),
    }];
    expect(initialMessages[0].content).toContain('[SYSTEM: Session compacted.]');
  });

  it('multiple compactions for same session preserves latest', () => {
    const store = new CompactionArtifactStore({ baseDir: ARTIFACTS_DIR });

    store.save({
      id: 'comp-1',
      sessionId: 'sess-multi',
      timestamp: new Date().toISOString(),
      resumePrompt: 'First compaction',
      tokensReclaimed: 10000,
    } as any);

    store.save({
      id: 'comp-2',
      sessionId: 'sess-multi',
      timestamp: new Date().toISOString(),
      resumePrompt: 'Second compaction',
      tokensReclaimed: 20000,
    } as any);

    const latest = store.getLatest('sess-multi');
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe('comp-2');
    expect(latest!.resumePrompt).toBe('Second compaction');
  });

  it('no artifact for unknown session returns null', () => {
    const store = new CompactionArtifactStore({ baseDir: ARTIFACTS_DIR });
    expect(store.getLatest('nonexistent')).toBeNull();
  });
});
