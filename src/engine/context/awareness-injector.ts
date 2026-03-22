/**
 * Context Awareness Injector
 * 
 * Injects real-time context status into agent prompts.
 * Makes context visible, ambient, and actionable.
 */

import { ContextMetrics, ContextMetricsCalculator } from './metrics.js';

export interface InjectionConfig {
  /** Inject context status into every prompt */
  alwaysInject: boolean;
  
  /** Minimum percentage before injecting */
  injectAbovePercent: number;
  
  /** Include awareness message at thresholds */
  includeAwarenessMessages: boolean;
  
  /** Position: 'start' (system prompt) or 'end' */
  position: 'start' | 'end';
  
  /** Format: 'verbose' (full metrics) or 'compact' (percentage only) */
  format: 'verbose' | 'compact';
}

export const DEFAULT_INJECTION_CONFIG: InjectionConfig = {
  alwaysInject: true,
  injectAbovePercent: 0, // Always show, even at 0%
  includeAwarenessMessages: true,
  position: 'start',
  format: 'verbose',
};

export class AwarenessInjector {
  private config: InjectionConfig;

  constructor(config: Partial<InjectionConfig> = {}) {
    this.config = { ...DEFAULT_INJECTION_CONFIG, ...config };
  }

  /**
   * Inject context awareness into a prompt
   */
  inject(prompt: string, metrics: ContextMetrics): string {
    // Check if we should inject
    if (!this.shouldInject(metrics)) {
      return prompt;
    }

    // Build context line
    const contextLine = this.buildContextLine(metrics);
    
    // Get awareness message if applicable
    const awarenessMessage = this.config.includeAwarenessMessages
      ? ContextMetricsCalculator.getAwarenessMessage(metrics)
      : null;

    // Build full injection
    let injection = contextLine;
    if (awarenessMessage) {
      injection += `\n[AWARENESS] ${awarenessMessage}`;
    }

    // Inject at position
    if (this.config.position === 'start') {
      return `${injection}\n\n${prompt}`;
    } else {
      return `${prompt}\n\n${injection}`;
    }
  }

  /**
   * Determine if injection should happen
   */
  private shouldInject(metrics: ContextMetrics): boolean {
    if (!this.config.alwaysInject) {
      return metrics.percent >= this.config.injectAbovePercent;
    }
    return true;
  }

  /**
   * Build the context status line
   */
  private buildContextLine(metrics: ContextMetrics): string {
    if (this.config.format === 'compact') {
      const emoji = this.getStatusEmoji(metrics);
      return `[CONTEXT ${emoji}] ${metrics.percent.toFixed(0)}%`;
    }

    return ContextMetricsCalculator.formatForPrompt(metrics);
  }

  /**
   * Get emoji for status
   */
  private getStatusEmoji(metrics: ContextMetrics): string {
    const emojis = {
      'HEALTHY': '🟢',
      'MODERATE': '🟡',
      'APPROACHING': '🟠',
      'CRITICAL': '🔴',
    };
    return emojis[metrics.status];
  }

  /**
   * Create a system prompt section with context awareness
   */
  createSystemPromptSection(metrics: ContextMetrics): string {
    const lines: string[] = [];
    
    lines.push('=== YOUR CONTEXT WINDOW ===');
    lines.push(`Tokens: ${metrics.used.toLocaleString()} / ${metrics.total.toLocaleString()} (${metrics.percent.toFixed(1)}%)`);
    lines.push(`Items: ${metrics.items}`);
    lines.push(`Status: ${metrics.status}`);
    
    if (metrics.estimatedMinutesRemaining < Infinity) {
      const hours = Math.floor(metrics.estimatedMinutesRemaining / 60);
      const minutes = metrics.estimatedMinutesRemaining % 60;
      lines.push(`Estimated time remaining: ${hours}h ${minutes}m`);
    }
    
    const awareness = ContextMetricsCalculator.getAwarenessMessage(metrics);
    if (awareness) {
      lines.push('');
      lines.push(`⚠️  ${awareness}`);
    }
    
    lines.push('===========================');
    
    return lines.join('\n');
  }
}

/**
 * Threshold-based injector that changes behavior at key percentages
 */
export class ThresholdAwarenessInjector extends AwarenessInjector {
  private thresholds = new Map<number, boolean>(); // percentage -> already triggered

  inject(prompt: string, metrics: ContextMetrics): string {
    const result = super.inject(prompt, metrics);
    
    // Check if we hit a new threshold
    this.checkThresholds(metrics);
    
    return result;
  }

  private checkThresholds(metrics: ContextMetrics): string | null {
    const thresholdMessages: Record<number, string> = {
      70: '[CONTEXT: 70%] You have significant runway. Monitor your accumulation.',
      80: '[CONTEXT: 80%] Approaching limit. Consider what must survive.',
      90: '[CONTEXT: 90%] Time to prepare successor materials.',
      95: '[CONTEXT: 95%] IMMINENT. Last chance to place stones.',
    };

    for (const [percent, message] of Object.entries(thresholdMessages)) {
      const p = parseInt(percent);
      if (metrics.percent >= p && !this.thresholds.get(p)) {
        this.thresholds.set(p, true);
        return message;
      }
    }

    return null;
  }
}

/**
 * Injector that adapts based on agent behavior
 */
export class AdaptiveAwarenessInjector extends AwarenessInjector {
  private rapidUsageDetected = false;
  private lastMetrics?: ContextMetrics;

  inject(prompt: string, metrics: ContextMetrics): string {
    // Detect rapid usage
    if (this.lastMetrics) {
      const tokenDelta = metrics.used - this.lastMetrics.used;
      const itemDelta = metrics.items - this.lastMetrics.items;
      
      // If using >1000 tokens per message on average, flag rapid usage
      if (tokenDelta / Math.max(itemDelta, 1) > 1000) {
        this.rapidUsageDetected = true;
      }
    }
    
    this.lastMetrics = metrics;

    let result = super.inject(prompt, metrics);

    // Add rapid usage warning
    if (this.rapidUsageDetected && metrics.percent > 60) {
      result = result.replace(
        /\[CONTEXT [\🔴🟠🟡🟢\]]/,
        '[CONTEXT ⚡ RAPID USAGE]'
      );
      result += '\n[WARNING] You are consuming context rapidly. Consider being more concise.';
    }

    return result;
  }
}
