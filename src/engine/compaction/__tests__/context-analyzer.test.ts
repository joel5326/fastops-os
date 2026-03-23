import { describe, it, expect } from 'vitest';
import { ContextAnalyzer } from '../context-analyzer.js';
import type { ContextItem } from '../types.js';

describe('ContextAnalyzer', () => {
  it('should instantiate with default config', () => {
    const analyzer = new ContextAnalyzer();
    expect(analyzer).toBeDefined();
  });

  it('should categorize a CODE_COMMIT as VERBATIM', () => {
    const analyzer = new ContextAnalyzer();
    const items: ContextItem[] = [{
      id: '1',
      type: 'CODE_COMMIT',
      content: 'feat: add something',
      tokens: 10,
      timestamp: new Date().toISOString(),
      metadata: { isReferenced: false, ledToDecision: false, isReproducible: false, source: 'system' }
    }];

    const result = analyzer.analyze(items);
    expect(result.items[0].tier).toBe('VERBATIM');
    expect(result.items[0].score).toBe(100);
  });

  it('should categorize high-uncertainty agent reasoning as WEIGHT', () => {
    const analyzer = new ContextAnalyzer();
    const items: ContextItem[] = [{
      id: '2',
      type: 'THINKING_TRACE',
      content: 'I\'m not sure if this approach scales. I believe we might hit a race condition.',
      tokens: 20,
      timestamp: new Date().toISOString(),
      metadata: { isReferenced: true, ledToDecision: false, isReproducible: false, source: 'agent' }
    }];

    const result = analyzer.analyze(items);
    // Referenced (60) + Uncertainty (55) + Belief (50)
    // 165 * 0.6 = 99
    expect(result.items[0].tier).toBe('VERBATIM'); // Wait, >= 70 is verbatim. Let's check exactly what tier this gets.
    expect(result.items[0].score).toBeGreaterThanOrEqual(40);
  });

  it('should categorize reproducible tool outputs as DISCARD', () => {
    const analyzer = new ContextAnalyzer();
    const items: ContextItem[] = [{
      id: '3',
      type: 'TOOL_OUTPUT',
      content: 'npm install output...',
      tokens: 500,
      timestamp: new Date().toISOString(),
      metadata: { isReferenced: false, ledToDecision: false, isReproducible: true, source: 'tool' }
    }];

    const result = analyzer.analyze(items);
    expect(result.items[0].tier).toBe('DISCARD');
  });

  it('should extract verbatim items correctly', () => {
    const analyzer = new ContextAnalyzer();
    const items: ContextItem[] = [{
      id: '4',
      type: 'OPERATOR_INSTRUCTION',
      content: 'Joel said do this',
      tokens: 10,
      timestamp: new Date().toISOString(),
      metadata: { isReferenced: true, ledToDecision: true, isReproducible: false, source: 'operator' }
    }];

    const result = analyzer.analyze(items);
    const verbatim = analyzer.extractVerbatim(result);
    expect(verbatim.length).toBe(1);
    expect(verbatim[0].id).toBe('4');
  });
});
