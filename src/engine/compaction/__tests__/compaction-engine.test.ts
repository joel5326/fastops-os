import { describe, it, expect, vi } from 'vitest';
import { CompactionEngine } from '../compaction-engine.js';
import { EventBus } from '../../core/event-bus.js';
import type { ContextItem } from '../types.js';

describe('CompactionEngine', () => {
  it('should run a complete compaction cycle and emit an artifact', async () => {
    const events = new EventBus();
    const emitSpy = vi.spyOn(events, 'emit');
    
    const engine = new CompactionEngine({ events });

    const items: ContextItem[] = [
      {
        id: '1',
        type: 'CODE_COMMIT',
        content: 'feat: explicit commit',
        tokens: 10,
        timestamp: new Date().toISOString(),
        metadata: { isReferenced: true, ledToDecision: true, isReproducible: false, source: 'system' }
      },
      {
        id: '2',
        type: 'TOOL_OUTPUT',
        content: 'ls -la output...',
        tokens: 500,
        timestamp: new Date().toISOString(),
        metadata: { isReferenced: false, ledToDecision: false, isReproducible: true, source: 'tool' }
      },
      {
        id: '3',
        type: 'THINKING_TRACE',
        content: 'I believe this approach works. But I am uncertain about the timeout.',
        tokens: 25,
        timestamp: new Date().toISOString(),
        metadata: { isReferenced: true, ledToDecision: false, isReproducible: false, source: 'agent' }
      }
    ];

    const result = await engine.compact('session-1', items, 'PERCENT', 95);
    
    expect(result.success).toBe(true);
    expect(result.tokensReclaimed).toBeGreaterThan(0);
    expect(emitSpy).toHaveBeenCalledWith('compaction.completed', expect.objectContaining({
      sessionId: 'session-1',
      artifactId: result.artifactId
    }));

    // Verify the emitted artifact shape
    const completedCall = emitSpy.mock.calls.find(call => call[0] === 'compaction.completed');
    const payload = completedCall![1] as any;
    expect(payload.artifact.verbatim.length).toBeGreaterThanOrEqual(1); // The CODE_COMMIT
    expect(payload.artifact.discard.length).toBeGreaterThanOrEqual(1); // The TOOL_OUTPUT
  });

  it('should handle extraction errors gracefully and emit failed event', async () => {
    const events = new EventBus();
    const emitSpy = vi.spyOn(events, 'emit');
    
    // Inject a faulty analyzer to force an error
    const engine = new CompactionEngine({
      events,
      analyzer: { analyze: () => { throw new Error('Analysis crash') } } as any
    });

    const result = await engine.compact('session-1', [], 'PERCENT', 95);
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Analysis crash');
    expect(emitSpy).toHaveBeenCalledWith('compaction.failed', {
      sessionId: 'session-1',
      error: 'Analysis crash'
    });
  });
});
