import { EventBus } from '../core/event-bus.js';
import { ContextAnalyzer } from './context-analyzer.js';
import { WeightExtractor } from './weight-extractor.js';
import type { 
  CompactionConfig, 
  ContextItem, 
  CompactionArtifact, 
  ContextStats,
  CompactionResult
} from './types.js';
import { DEFAULT_COMPACTION_CONFIG } from './types.js';

export interface CompactionEngineOptions {
  events: EventBus;
  config?: Partial<CompactionConfig>;
  analyzer?: ContextAnalyzer;
  extractor?: WeightExtractor;
}

/**
 * CompactionEngine orchestrates the compaction lifecycle.
 * Phase 4 Core Orchestrator.
 * 
 * Pipeline:
 * 1. Takes raw context items
 * 2. Runs through ContextAnalyzer (assigns Verbatim/Weight/Discard tiers)
 * 3. Runs through WeightExtractor (Cairn protocol + plugins)
 * 4. Assembles CompactionArtifact
 * 5. Emits completion events
 */
export class CompactionEngine {
  private events: EventBus;
  private config: CompactionConfig;
  private analyzer: ContextAnalyzer;
  private extractor: WeightExtractor;

  constructor(opts: CompactionEngineOptions) {
    this.events = opts.events;
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...opts.config };
    
    // Instantiate sub-components if not injected
    this.analyzer = opts.analyzer ?? new ContextAnalyzer();
    this.extractor = opts.extractor ?? new WeightExtractor(this.config.weightExtraction);
  }

  /**
   * Run the full compaction pipeline for a session
   */
  public async compact(
    sessionId: string, 
    items: ContextItem[], 
    triggerType: 'PERCENT' | 'ABSOLUTE' | 'PREEMPTIVE' | 'MANUAL' = 'PERCENT',
    triggerValue: number | string = 100
  ): Promise<CompactionResult> {
    try {
      this.events.emit('compaction.started', { sessionId, triggerType, triggerValue });

      // Step 1: Calculate initial stats
      const contextStats = this.calculateStats(items);

      // Step 2: Algorithmic Tier Assignment
      const analysis = this.analyzer.analyze(items);

      // Extract items by assigned tier
      const verbatimItems = analysis.items.filter(i => i.tier === 'VERBATIM');
      const weightItems = analysis.items.filter(i => i.tier === 'WEIGHT');
      const discardItems = analysis.items.filter(i => i.tier === 'DISCARD');

      const verbatimIds = new Set(verbatimItems.map(i => i.itemId));
      const discardIds = discardItems.map(i => i.itemId);

      // Prepare verbatim payload
      const verbatimPayload = items
        .filter(item => verbatimIds.has(item.id))
        .map(item => ({
          id: item.id,
          type: item.type,
          content: item.content,
          metadata: item.metadata,
          preservationReason: verbatimItems.find(vi => vi.itemId === item.id)?.reasoning || 'Default verbatim'
        }));

      // Step 3: Weight Extraction (Cairn Protocol / Inferred)
      // Pass the items marked as WEIGHT to the extractor
      const weightContents = items
        .filter(item => weightItems.some(wi => wi.itemId === item.id))
        .map(item => item.content);
        
      const weightSnapshot = await this.extractor.extract(weightContents);

      // Calculate compression metrics
      const originalTokens = contextStats.totalTokens;
      // Rough sum: verbatim tokens + weight tokens
      const newVerbatimTokens = items
        .filter(item => verbatimIds.has(item.id))
        .reduce((sum, item) => sum + item.tokens, 0);
        
      const newTokens = newVerbatimTokens + weightSnapshot.compressedTokens;
      const tokensReclaimed = Math.max(0, originalTokens - newTokens);
      const compressionRatio = originalTokens > 0 ? (newTokens / originalTokens) : 0;

      // Step 4: Assemble Artifact
      const artifactId = `comp-${sessionId}-${Date.now()}`;
      
      const artifact: CompactionArtifact = {
        id: artifactId,
        sessionId,
        timestamp: new Date().toISOString(),
        trigger: this.buildTrigger(triggerType, triggerValue),
        contextStats,
        verbatim: verbatimPayload,
        weight: weightSnapshot,
        discard: discardIds,
        resumePrompt: this.generateResumePrompt(verbatimPayload.length, weightSnapshot),
        tokensReclaimed,
        compressionRatio
      };

      // Step 5: Emit Completion
      this.events.emit('compaction.completed', {
        sessionId,
        artifactId,
        artifact,
        metrics: {
          originalTokens,
          newTokens,
          tokensReclaimed,
          compressionRatio
        }
      });

      return {
        success: true,
        artifactId,
        tokensReclaimed,
        weightPreserved: weightItems.length,
      };

    } catch (error: any) {
      this.events.emit('compaction.failed', { sessionId, error: error.message });
      return {
        success: false,
        artifactId: '',
        tokensReclaimed: 0,
        weightPreserved: 0,
        error: error.message
      };
    }
  }

  /**
   * Helper to calculate pre-compaction stats
   */
  private calculateStats(items: ContextItem[]): ContextStats {
    const stats: ContextStats = {
      totalTokens: 0,
      totalItems: items.length,
      byType: {},
      byTier: { verbatim: 0, weight: 0, discard: 0 }
    };

    for (const item of items) {
      stats.totalTokens += item.tokens;
      stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
    }

    return stats;
  }

  private buildTrigger(type: string, value: number | string) {
    if (type === 'PERCENT') return { type: 'PERCENT' as const, at: Number(value) };
    if (type === 'ABSOLUTE') return { type: 'ABSOLUTE' as const, at: Number(value) };
    if (type === 'PREEMPTIVE') return { type: 'PREEMPTIVE' as const, reason: String(value) };
    return { type: 'MANUAL' as const, by: String(value) };
  }

  private generateResumePrompt(verbatimCount: number, weight: any): string {
    const inference = weight.inferred;
    let text = `[SYSTEM: Session compacted. ${verbatimCount} explicit memories preserved.]\n`;
    
    if (inference) {
      if (inference.emergentBeliefs?.length > 0) {
        text += `Established Beliefs:\n- ${inference.emergentBeliefs.join('\n- ')}\n`;
      }
      if (inference.activeUncertainties?.length > 0) {
        text += `Active Uncertainties:\n- ${inference.activeUncertainties.join('\n- ')}\n`;
      }
      if (inference.pendingQuestions?.length > 0) {
        text += `Pending Focus:\n- ${inference.pendingQuestions.join('\n- ')}\n`;
      }
    } else {
      text += 'Weight extraction generated abstract state.';
    }

    return text;
  }
}
