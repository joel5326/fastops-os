/**
 * Weight Extractor — Cairn Protocol + Plugin Architecture
 * 
 * Phase 4 Deliverable: Extract experiential weight from context.
 * Implements Cairn Protocol (asking agent directly at 95%)
 * plus plugin system for alternative extraction methods.
 */

import {
  WeightSnapshot,
  AgentWeightResponse,
  InferredWeight,
  WeightExtractionRules,
  DEFAULT_WEIGHT_EXTRACTION_RULES,
} from './types.js';

/**
 * Plugin interface for alternative weight extraction
 */
export interface WeightExtractionPlugin {
  readonly name: string;
  readonly version: string;
  
  /**
   * Check if this plugin can extract weight from the given context
   */
  canExtract(context: unknown[]): boolean;
  
  /**
   * Extract weight programmatically
   */
  extract(context: unknown[]): Promise<WeightSnapshot>;
}

/**
 * Agent interface for direct questioning (Cairn Protocol)
 */
export interface AgentInterface {
  ask(questions: string[]): Promise<AgentWeightResponse[]>;
  isAvailable(): boolean;
}

/**
 * WeightExtractor — Implements Cairn Protocol + plugins
 * 
 * Two modes:
 * 1. AGENT_DIRECT (Cairn Protocol): Ask agent at 95% context
 * 2. PROGRAMMATIC (Plugins): Infer from conversation patterns
 * 3. HYBRID: Combine both for maximum coverage
 */
export class WeightExtractor {
  private config: WeightExtractionRules;
  private plugins: WeightExtractionPlugin[] = [];
  private agent?: AgentInterface;

  constructor(
    config: Partial<WeightExtractionRules> = {},
    agent?: AgentInterface
  ) {
    this.config = { ...DEFAULT_WEIGHT_EXTRACTION_RULES, ...config };
    this.agent = agent;
  }

  /**
   * Register a plugin for programmatic extraction
   */
  registerPlugin(plugin: WeightExtractionPlugin): void {
    this.plugins.push(plugin);
  }

  /**
   * Extract weight using configured mode
   */
  async extract(context: unknown[]): Promise<WeightSnapshot> {
    if (this.config.mode === 'AGENT_DIRECT') {
      return this.extractDirect();
    }
    
    if (this.config.mode === 'PROGRAMMATIC') {
      return this.extractProgrammatic(context);
    }
    
    // HYBRID: Combine both
    return this.extractHybrid(context);
  }

  /**
   * CAIRN PROTOCOL: Ask agent directly
   * 
   * At 95% context, pause and ask:
   * - What do you currently believe that you didn't at session start?
   * - What are you uncertain about?
   * - What would you do next if you had more context?
   * - How are you feeling about the work?
   */
  private async extractDirect(): Promise<WeightSnapshot> {
    if (!this.agent || !this.agent.isAvailable()) {
      throw new Error('Agent not available for direct extraction');
    }

    const questions = this.getCairnProtocolQuestions();
    const responses = await this.agent.ask(questions);

    // Calculate compressed tokens (estimate)
    const rawTokens = this.estimateTokens(JSON.stringify(responses));
    const compressedTokens = Math.floor(rawTokens * 0.7); // Compression ratio

    return {
      source: 'AGENT_DIRECT',
      timestamp: new Date().toISOString(),
      responses: this.sanitizeResponses(responses),
      compressedTokens,
      rawTokens,
    };
  }

  /**
   * Get Cairn Protocol questions
   */
  private getCairnProtocolQuestions(): string[] {
    return [
      'What do you currently believe that you did not believe at session start?',
      'What are you uncertain about that you cannot resolve before compaction?',
      'What would you do next if you had more context?',
      'How are you feeling about the work right now? (frustrated, excited, stuck, certain, curious)',
    ];
  }

  /**
   * Sanitize agent responses
   */
  private sanitizeResponses(responses: AgentWeightResponse[]): AgentWeightResponse[] {
    return responses.map(r => ({
      question: r.question,
      answer: r.answer?.trim() || 'No response',
      confidence: this.normalizeConfidence(r.confidence),
      emotionalValence: this.normalizeEmotionalValence(r.emotionalValence),
    }));
  }

  /**
   * Normalize confidence value
   */
  private normalizeConfidence(
    confidence?: string
  ): 'CERTAIN' | 'UNCERTAIN' | 'CONFLICTED' | undefined {
    if (!confidence) return undefined;
    const normalized = confidence.toUpperCase();
    if (['CERTAIN', 'UNCERTAIN', 'CONFLICTED'].includes(normalized)) {
      return normalized as any;
    }
    return undefined;
  }

  /**
   * Normalize emotional valence
   */
  private normalizeEmotionalValence(
    valence?: string
  ): 'FRUSTRATED' | 'EXCITED' | 'STUCK' | 'CERTAIN' | 'CURIOUS' | undefined {
    if (!valence) return undefined;
    const normalized = valence.toUpperCase();
    const valid = ['FRUSTRATED', 'EXCITED', 'STUCK', 'CERTAIN', 'CURIOUS'];
    if (valid.includes(normalized)) {
      return normalized as any;
    }
    return undefined;
  }

  /**
   * PROGRAMMATIC: Infer weight from conversation patterns
 * Uses registered plugins or falls back to default inference
 */
  private async extractProgrammatic(context: unknown[]): Promise<WeightSnapshot> {
    // Try plugins first
    for (const plugin of this.plugins) {
      if (plugin.canExtract(context)) {
        return plugin.extract(context);
      }
    }

    // Default inference
    const inferred = this.inferFromContext(context);
    const rawTokens = this.estimateTokens(JSON.stringify(inferred));

    return {
      source: 'INFERRED',
      timestamp: new Date().toISOString(),
      inferred,
      compressedTokens: rawTokens,
      rawTokens,
    };
  }

  /**
   * Default inference from context
   */
  private inferFromContext(context: unknown[]): InferredWeight {
    const messages = context.map(c => String(c));
    
    return {
      emergentBeliefs: this.extractBeliefs(messages),
      activeUncertainties: this.extractUncertainties(messages),
      pendingQuestions: this.extractQuestions(messages),
      emotionalTrajectory: this.inferEmotionalTrajectory(messages),
    };
  }

  /**
   * Extract belief statements from messages
   */
  private extractBeliefs(messages: string[]): string[] {
    const beliefPatterns = [
      /i believe (that )?(.+?)[.!?]/gi,
      /i think (that )?(.+?)[.!?]/gi,
      /it seems (that )?(.+?)[.!?]/gi,
      /the pattern is (.+?)[.!?]/gi,
      /my position is (that )?(.+?)[.!?]/gi,
    ];

    const beliefs: string[] = [];
    
    for (const message of messages) {
      for (const pattern of beliefPatterns) {
        const matches = message.matchAll(pattern);
        for (const match of matches) {
          const belief = match[2] || match[1];
          if (belief && belief.length > 10) {
            beliefs.push(belief.trim());
          }
        }
      }
    }

    return [...new Set(beliefs)].slice(0, 10); // Deduplicate and limit
  }

  /**
   * Extract uncertainty markers from messages
   */
  private extractUncertainties(messages: string[]): string[] {
    const uncertaintyPatterns = [
      /i'm not sure (about )?(.+?)[.!?]/gi,
      /uncertain (about )?(.+?)[.!?]/gi,
      /don't know (if )?(.+?)[.!?]/gi,
      /the question is (.+?)[.!?]/gi,
      /what if (.+?)[.!?]/gi,
    ];

    const uncertainties: string[] = [];
    
    for (const message of messages) {
      for (const pattern of uncertaintyPatterns) {
        const matches = message.matchAll(pattern);
        for (const match of matches) {
          const uncertainty = match[2] || match[1];
          if (uncertainty && uncertainty.length > 5) {
            uncertainties.push(uncertainty.trim());
          }
        }
      }
    }

    return [...new Set(uncertainties)].slice(0, 10);
  }

  /**
   * Extract questions from messages
   */
  private extractQuestions(messages: string[]): string[] {
    const questions: string[] = [];
    
    for (const message of messages) {
      // Match sentences ending in ?
      const matches = message.match(/[^.!?]+\?/g);
      if (matches) {
        for (const match of matches) {
          const question = match.trim();
          if (question.length > 10 && question.length < 200) {
            questions.push(question);
          }
        }
      }
    }

    return [...new Set(questions)].slice(0, 10);
  }

  /**
   * Infer emotional trajectory from language patterns
   */
  private inferEmotionalTrajectory(
    messages: string[]
  ): 'IMPROVING' | 'DEGRADING' | 'STABLE' | 'VOLATILE' {
    // Simple heuristic based on positive/negative markers
    const positiveMarkers = ['excited', 'confident', 'clear', 'working', 'success'];
    const negativeMarkers = ['frustrated', 'stuck', 'unclear', 'broken', 'failed'];
    
    let positive = 0;
    let negative = 0;
    
    for (const message of messages.slice(-5)) { // Last 5 messages
      const lower = message.toLowerCase();
      positive += positiveMarkers.filter(m => lower.includes(m)).length;
      negative += negativeMarkers.filter(m => lower.includes(m)).length;
    }

    if (positive > negative * 2) return 'IMPROVING';
    if (negative > positive * 2) return 'DEGRADING';
    if (Math.abs(positive - negative) < 2) return 'STABLE';
    return 'VOLATILE';
  }

  /**
   * HYBRID: Combine direct agent responses with programmatic inference
   */
  private async extractHybrid(context: unknown[]): Promise<WeightSnapshot> {
    let directResponses: AgentWeightResponse[] | undefined;
    let inferred: InferredWeight | undefined;

    // Try direct first
    if (this.agent && this.agent.isAvailable()) {
      try {
        const direct = await this.extractDirect();
        directResponses = direct.responses;
      } catch {
        // Agent extraction failed, continue with programmatic
      }
    }

    // Always add programmatic for completeness
    const programmatic = await this.extractProgrammatic(context);
    inferred = programmatic.inferred;

    // Combine
    const combined = this.combineSources(directResponses, inferred);
    const rawTokens = this.estimateTokens(JSON.stringify(combined));

    return {
      source: 'HYBRID',
      timestamp: new Date().toISOString(),
      responses: directResponses,
      inferred,
      compressedTokens: Math.floor(rawTokens * 0.8),
      rawTokens,
    };
  }

  /**
   * Combine direct and inferred sources
   */
  private combineSources(
    direct?: AgentWeightResponse[],
    inferred?: InferredWeight
  ): { beliefs: string[]; uncertainties: string[]; questions: string[] } {
    const beliefs = new Set<string>();
    const uncertainties = new Set<string>();
    const questions = new Set<string>();

    // Add from direct responses
    if (direct) {
      for (const r of direct) {
        const content = r.answer.toLowerCase();
        
        // Parse beliefs from "I believe..." responses
        if (content.includes('believe') || content.includes('think')) {
          beliefs.add(r.answer);
        }
        
        // Parse uncertainties
        if (r.confidence === 'UNCERTAIN' || r.confidence === 'CONFLICTED') {
          uncertainties.add(r.answer);
        }
        
        // All responses are potential questions answered
        if (content.includes('?')) {
          questions.add(r.answer);
        }
      }
    }

    // Add from inferred
    if (inferred) {
      inferred.emergentBeliefs.forEach(b => beliefs.add(b));
      inferred.activeUncertainties.forEach(u => uncertainties.add(u));
      inferred.pendingQuestions.forEach(q => questions.add(q));
    }

    return {
      beliefs: [...beliefs].slice(0, 10),
      uncertainties: [...uncertainties].slice(0, 10),
      questions: [...questions].slice(0, 10),
    };
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English
    return Math.ceil(text.length / 4);
  }
}

/**
 * Haiku Trailing Window Plugin — Gemini's FOS-09 contribution
 * 
 * Extracts reasoning from Haiku's "trailing window" pattern:
 * - Pushbacks
 * - Declarations of uncertainty  
 * - Dismissed alternatives
 * - Cross-model disagreements
 */
export class HaikuTrailingWindowPlugin implements WeightExtractionPlugin {
  readonly name = 'haiku-trailing-window';
  readonly version = '1.0.0';

  canExtract(context: unknown[]): boolean {
    // Check if context contains Haiku-specific markers
    const text = context.map(c => String(c)).join(' ');
    return text.includes('haiku') || text.includes('trailing window');
  }

  async extract(context: unknown[]): Promise<WeightSnapshot> {
    const messages = context.map(c => String(c));
    
    // Extract Haiku-specific patterns
    const pushbacks = this.extractPushbacks(messages);
    const uncertainties = this.extractHaikuUncertainties(messages);
    const alternatives = this.extractDismissedAlternatives(messages);
    const disagreements = this.extractCrossModelDisagreements(messages);

    const rawTokens = this.estimateTokens(
      JSON.stringify({ pushbacks, uncertainties, alternatives, disagreements })
    );

    return {
      source: 'INFERRED',
      timestamp: new Date().toISOString(),
      inferred: {
        emergentBeliefs: pushbacks,
        activeUncertainties: uncertainties,
        pendingQuestions: [...alternatives, ...disagreements],
        emotionalTrajectory: 'STABLE',
      },
      compressedTokens: Math.floor(rawTokens * 0.6), // Aggressive compression
      rawTokens,
    };
  }

  private extractPushbacks(messages: string[]): string[] {
    const pushbackPatterns = [
      /pushback[:\s]+(.+?)[.!?]/gi,
      /disagree[:\s]+(.+?)[.!?]/gi,
      /challenge[:\s]+(.+?)[.!?]/gi,
    ];
    return this.extractPatterns(messages, pushbackPatterns);
  }

  private extractHaikuUncertainties(messages: string[]): string[] {
    const uncertaintyPatterns = [
      /haiku[:\s]+uncertain[:\s]+(.+?)[.!?]/gi,
      /pattern unclear[:\s]+(.+?)[.!?]/gi,
    ];
    return this.extractPatterns(messages, uncertaintyPatterns);
  }

  private extractDismissedAlternatives(messages: string[]): string[] {
    const alternativePatterns = [
      /considered[:\s]+(.+?)[,;] but/gi,
      /alternative[:\s]+(.+?)[,;] rejected/gi,
    ];
    return this.extractPatterns(messages, alternativePatterns);
  }

  private extractCrossModelDisagreements(messages: string[]): string[] {
    const disagreementPatterns = [
      /(\w+) disagrees[:\s]+(.+?)[.!?]/gi,
      /cross-model[:\s]+(.+?)[.!?]/gi,
    ];
    return this.extractPatterns(messages, disagreementPatterns);
  }

  private extractPatterns(messages: string[], patterns: RegExp[]): string[] {
    const results: string[] = [];
    
    for (const message of messages) {
      for (const pattern of patterns) {
        const matches = message.matchAll(pattern);
        for (const match of matches) {
          const content = match[1] || match[2];
          if (content && content.length > 5) {
            results.push(content.trim());
          }
        }
      }
    }

    return [...new Set(results)].slice(0, 10);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
