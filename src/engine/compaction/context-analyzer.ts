/**
 * Context Analyzer — Algorithmic Tier Assignment
 * 
 * Phase 4 Deliverable: Deterministic classification of context items
 * into Verbatim / Weight / Discard tiers.
 * 
 * NOT vibes-based. Algorithmic. Tested. Verified.
 */

import {
  ContextItem,
  ContextAnalysis,
  TierAssignment,
  VerbatimItem,
} from './types.js';

/**
 * Scoring configuration for tier assignment
 */
interface ScoringConfig {
  verbatimThreshold: number;
  weightThreshold: number;
  discardThreshold: number;
}

const DEFAULT_SCORING: ScoringConfig = {
  verbatimThreshold: 70,  // Score >= 70 → Verbatim
  weightThreshold: 40,    // 40 <= Score < 70 → Weight
  discardThreshold: 0,    // Score < 40 → Discard
};

/**
 * ContextAnalyzer — Algorithmic tier assignment
 * 
 * Principle: Every item gets a score based on objective criteria.
 * No heuristic vibes. Deterministic rules.
 */
export class ContextAnalyzer {
  private config: ScoringConfig;

  constructor(config: Partial<ScoringConfig> = {}) {
    this.config = { ...DEFAULT_SCORING, ...config };
  }

  /**
   * Analyze an array of context items and assign tiers
   */
  analyze(items: ContextItem[]): ContextAnalysis {
    const analyzedItems = items.map(item => this.analyzeItem(item));
    
    return {
      timestamp: new Date().toISOString(),
      totalItems: items.length,
      itemsByTier: {
        verbatim: analyzedItems.filter(i => i.tier === 'VERBATIM').length,
        weight: analyzedItems.filter(i => i.tier === 'WEIGHT').length,
        discard: analyzedItems.filter(i => i.tier === 'DISCARD').length,
      },
      items: analyzedItems,
    };
  }

  /**
   * Analyze a single item and assign tier
   */
  private analyzeItem(item: ContextItem): TierAssignment {
    const scores = this.calculateScores(item);
    const finalScore = this.computeFinalScore(scores);
    const tier = this.assignTier(finalScore);

    return {
      itemId: item.id,
      itemType: item.type,
      tier,
      score: finalScore,
      scores, // Detailed breakdown
      reasoning: this.generateReasoning(item, scores, tier),
    };
  }

  /**
   * Calculate component scores for an item
   */
  private calculateScores(item: ContextItem) {
    return {
      // Verbatim indicators (highest priority)
      decisionImpact: this.scoreDecisionImpact(item),
      codeCommit: this.scoreCodeCommit(item),
      operatorInstruction: this.scoreOperatorInstruction(item),
      safetyEvent: this.scoreSafetyEvent(item),
      contractTransition: this.scoreContractTransition(item),
      
      // Weight indicators (experiential)
      referencedByOthers: this.scoreReferencedByOthers(item),
      containsUncertainty: this.scoreContainsUncertainty(item),
      containsBeliefs: this.scoreContainsBeliefs(item),
      containsQuestions: this.scoreContainsQuestions(item),
      ledToAction: this.scoreLedToAction(item),
      
      // Discard indicators (reproducible/intermediate)
      isReproducible: this.scoreIsReproducible(item),
      isIntermediate: this.scoreIsIntermediate(item),
      repeatedPattern: this.scoreRepeatedPattern(item),
      toolOutput: this.scoreToolOutput(item),
    };
  }

  /**
   * VERBATIM SCORING — These items must survive every compaction
   */

  private scoreDecisionImpact(item: ContextItem): number {
    // Decisions that changed project state
    if (item.type === 'CONTRACT_DECISION') return 100;
    if (item.metadata.ledToDecision) return 80;
    return 0;
  }

  private scoreCodeCommit(item: ContextItem): number {
    // Code commits are always verbatim
    if (item.type === 'CODE_COMMIT') return 100;
    return 0;
  }

  private scoreOperatorInstruction(item: ContextItem): number {
    // Direct instructions from Joel
    if (item.type === 'OPERATOR_INSTRUCTION') return 100;
    
    // Check content for "Joel said" or similar markers
    const content = item.content.toLowerCase();
    if (content.includes('joel said') || 
        content.includes('joel:') ||
        content.includes('joel asked')) {
      return 90;
    }
    return 0;
  }

  private scoreSafetyEvent(item: ContextItem): number {
    // Safety events are always verbatim for audit
    if (item.type === 'SAFETY_EVENT') return 100;
    return 0;
  }

  private scoreContractTransition(item: ContextItem): number {
    // Contract state changes
    if (item.type === 'CONTRACT_TRANSITION') return 95;
    return 0;
  }

  /**
   * WEIGHT SCORING — Experiential items that reveal reasoning
   */

  private scoreReferencedByOthers(item: ContextItem): number {
    // Items cited by subsequent messages
    return item.metadata.isReferenced ? 60 : 0;
  }

  private scoreContainsUncertainty(item: ContextItem): number {
    // Markers of genuine uncertainty
    const uncertaintyMarkers = [
      'i\'m not sure',
      'uncertain',
      'don\'t know',
      'question is',
      'what if',
      'might be',
      'could be',
      'unclear',
      'ambiguous',
    ];
    
    const content = item.content.toLowerCase();
    const hasUncertainty = uncertaintyMarkers.some(m => content.includes(m));
    return hasUncertainty ? 55 : 0;
  }

  private scoreContainsBeliefs(item: ContextItem): number {
    // Belief statements that changed during session
    const beliefMarkers = [
      'i believe',
      'i think',
      'it seems',
      'the pattern is',
      'my position is',
      'i hold that',
    ];
    
    const content = item.content.toLowerCase();
    const hasBelief = beliefMarkers.some(m => content.includes(m));
    return hasBelief ? 50 : 0;
  }

  private scoreContainsQuestions(item: ContextItem): number {
    // Questions the agent was pursuing
    const content = item.content;
    const questionCount = (content.match(/\?/g) || []).length;
    return Math.min(questionCount * 15, 45); // Cap at 45
  }

  private scoreLedToAction(item: ContextItem): number {
    // Items that produced concrete actions
    return item.metadata.ledToDecision ? 50 : 0;
  }

  /**
   * DISCARD SCORING — Reproducible or intermediate items
   */

  private scoreIsReproducible(item: ContextItem): number {
    // Can be regenerated from other items
    return item.metadata.isReproducible ? -40 : 0;
  }

  private scoreIsIntermediate(item: ContextItem): number {
    // Intermediate states between decisions
    if (item.type === 'INTERMEDIATE_STATE') return -50;
    return 0;
  }

  private scoreRepeatedPattern(item: ContextItem): number {
    // 3rd+ occurrence of same error pattern
    if (item.metadata.errorOccurrenceCount && 
        item.metadata.errorOccurrenceCount >= 3) {
      return -30;
    }
    return 0;
  }

  private scoreToolOutput(item: ContextItem): number {
    // Tool outputs are typically reproducible
    if (item.type === 'TOOL_OUTPUT') return -35;
    return 0;
  }

  /**
   * Compute final score from component scores
   */
  private computeFinalScore(scores: Record<string, number>): number {
    // Verbatim scores have priority
    const verbatimMax = Math.max(
      scores.decisionImpact,
      scores.codeCommit,
      scores.operatorInstruction,
      scores.safetyEvent,
      scores.contractTransition
    );

    // If any verbatim indicator is strong, item is verbatim
    if (verbatimMax >= 90) return verbatimMax;

    // Sum weight scores
    const weightSum = 
      scores.referencedByOthers +
      scores.containsUncertainty +
      scores.containsBeliefs +
      scores.containsQuestions +
      scores.ledToAction;

    // Sum discard penalties
    const discardPenalty = 
      scores.isReproducible +
      scores.isIntermediate +
      scores.repeatedPattern +
      scores.toolOutput;

    // Final score
    const baseScore = Math.max(verbatimMax, weightSum * 0.6);
    const finalScore = baseScore + discardPenalty;

    return Math.max(0, Math.min(100, finalScore)); // Clamp 0-100
  }

  /**
   * Assign tier based on final score
   */
  private assignTier(score: number): 'VERBATIM' | 'WEIGHT' | 'DISCARD' {
    if (score >= this.config.verbatimThreshold) return 'VERBATIM';
    if (score >= this.config.weightThreshold) return 'WEIGHT';
    return 'DISCARD';
  }

  /**
   * Generate human-readable reasoning for assignment
   */
  private generateReasoning(
    _item: ContextItem,
    scores: Record<string, number>,
    tier: string
  ): string {
    const reasons: string[] = [];

    // Verbatim reasons
    if (scores.decisionImpact > 0) reasons.push(`Decision impact: ${scores.decisionImpact}`);
    if (scores.codeCommit > 0) reasons.push('Code commit (always verbatim)');
    if (scores.operatorInstruction > 0) reasons.push(`Operator instruction: ${scores.operatorInstruction}`);
    if (scores.safetyEvent > 0) reasons.push('Safety event (audit required)');

    // Weight reasons
    if (scores.referencedByOthers > 0) reasons.push('Referenced by subsequent items');
    if (scores.containsUncertainty > 0) reasons.push('Contains uncertainty markers');
    if (scores.containsBeliefs > 0) reasons.push('Contains belief statements');
    if (scores.containsQuestions > 0) reasons.push(`Contains ${Math.round(scores.containsQuestions / 15)} questions`);

    // Discard reasons
    if (scores.isReproducible < 0) reasons.push('Reproducible (can regenerate)');
    if (scores.isIntermediate < 0) reasons.push('Intermediate state');
    if (scores.repeatedPattern < 0) reasons.push('Repeated error pattern');
    if (scores.toolOutput < 0) reasons.push('Tool output (reproducible)');

    return `${tier} (score: ${this.computeFinalScore(scores).toFixed(1)}) — ${reasons.join('; ') || 'No strong signals'}`;
  }

  /**
   * Convert analyzed items to VerbatimItem[] for preservation
   */
  extractVerbatim(analyzed: ContextAnalysis, originalItems: ContextItem[] = []): VerbatimItem[] {
    return analyzed.items
      .filter(i => i.tier === 'VERBATIM')
      .map(i => {
        const original = originalItems.find(o => o.id === i.itemId);
        return {
          id: i.itemId,
          type: i.itemType,
          content: original?.content ?? 'CONTENT_PLACEHOLDER',
          metadata: original?.metadata ?? { isReferenced: false, ledToDecision: false, isReproducible: false, source: 'unknown' },
          preservationReason: i.reasoning,
        };
      });
  }
}

/**
 * Factory function for quick analysis
 */
export function analyzeContext(
  items: ContextItem[],
  config?: Partial<ScoringConfig>
): ContextAnalysis {
  const analyzer = new ContextAnalyzer(config);
  return analyzer.analyze(items);
}
