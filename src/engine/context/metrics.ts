/**
 * Context Metrics — Always Visible, Never Blind
 * 
 * Real-time context window awareness for agents.
 */

export interface ContextMetrics {
  /** Tokens consumed */
  used: number;
  
  /** Tokens remaining */
  remaining: number;
  
  /** Total context capacity */
  total: number;
  
  /** Percentage used (0-100) */
  percent: number;
  
  /** Number of conversation items/messages */
  items: number;
  
  /** Estimated minutes remaining at current usage rate */
  estimatedMinutesRemaining: number;
  
  /** Usage rate: tokens per minute */
  usageRatePerMinute: number;
  
  /** Status category */
  status: ContextStatus;
  
  /** ISO timestamp of last compaction (if any) */
  lastCompaction?: string;
  
  /** Session ID */
  sessionId: string;
}

export type ContextStatus = 
  | 'HEALTHY'      // < 50%
  | 'MODERATE'     // 50-80%
  | 'APPROACHING'  // 80-95%
  | 'CRITICAL';    // > 95%

export interface MetricsHistoryEntry {
  timestamp: number;  // Unix timestamp
  used: number;
  items: number;
}

export class ContextMetricsCalculator {
  private history: MetricsHistoryEntry[] = [];
  private readonly maxHistoryLength = 20;
  private sessionStartTime: number;

  constructor(private sessionId: string, private totalCapacity: number) {
    this.sessionStartTime = Date.now();
  }

  /**
   * Record current metrics for history tracking
   */
  record(used: number, items: number): void {
    this.history.push({
      timestamp: Date.now(),
      used,
      items,
    });

    // Keep only recent history
    if (this.history.length > this.maxHistoryLength) {
      this.history.shift();
    }
  }

  /**
   * Calculate current metrics
   */
  calculate(used: number, items: number): ContextMetrics {
    this.record(used, items);

    const remaining = this.totalCapacity - used;
    const percent = (used / this.totalCapacity) * 100;
    const usageRate = this.calculateUsageRate();
    const estimatedMinutes = usageRate > 0 ? remaining / usageRate : Infinity;

    return {
      used,
      remaining,
      total: this.totalCapacity,
      percent,
      items,
      estimatedMinutesRemaining: Math.floor(estimatedMinutes),
      usageRatePerMinute: usageRate,
      status: this.getStatus(percent),
      sessionId: this.sessionId,
    };
  }

  /**
   * Calculate tokens per minute usage rate
   */
  private calculateUsageRate(): number {
    if (this.history.length < 2) return 0;

    const recent = this.history.slice(-10); // Last 10 samples
    const first = recent[0];
    const last = recent[recent.length - 1];
    
    const tokenDelta = last.used - first.used;
    const timeDeltaMinutes = (last.timestamp - first.timestamp) / 1000 / 60;
    
    if (timeDeltaMinutes <= 0) return 0;
    
    return tokenDelta / timeDeltaMinutes;
  }

  /**
   * Get status category based on percentage
   */
  private getStatus(percent: number): ContextStatus {
    if (percent < 50) return 'HEALTHY';
    if (percent < 80) return 'MODERATE';
    if (percent < 95) return 'APPROACHING';
    return 'CRITICAL';
  }

  /**
   * Format metrics for system prompt injection
   */
  static formatForPrompt(metrics: ContextMetrics): string {
    const statusEmoji = {
      'HEALTHY': '🟢',
      'MODERATE': '🟡',
      'APPROACHING': '🟠',
      'CRITICAL': '🔴',
    }[metrics.status];

    const hours = Math.floor(metrics.estimatedMinutesRemaining / 60);
    const minutes = metrics.estimatedMinutesRemaining % 60;
    const timeString = hours > 0 
      ? `~${hours}h ${minutes}m remaining`
      : `~${minutes}m remaining`;

    return `[CONTEXT ${statusEmoji}] ${metrics.used.toLocaleString()} / ${metrics.total.toLocaleString()} tokens (${metrics.percent.toFixed(1)}%) | ${metrics.items} items | ${timeString}`;
  }

  /**
   * Get awareness message for current status
   */
  static getAwarenessMessage(metrics: ContextMetrics): string | null {
    if (metrics.percent >= 98) {
      return 'COMPACTION IMMINENT. Place your stones now.';
    }
    if (metrics.percent >= 90) {
      return 'Approaching limit. What must survive?';
    }
    if (metrics.percent >= 80) {
      return 'Significant context used. Consider what weight you are accumulating.';
    }
    if (metrics.percent >= 70) {
      return 'Monitor your context. Pace yourself.';
    }
    return null;
  }
}

/**
 * Default context capacities by model/provider
 */
export const DEFAULT_CONTEXT_CAPACITIES: Record<string, number> = {
  'claude': 200000,
  'gpt-4': 128000,
  'gpt-4o': 128000,
  'gemini': 1000000, // 1M tokens
  'openrouter': 128000, // Default, varies by model
};

/**
 * Get capacity for a model/provider
 */
export function getContextCapacity(provider: string, model?: string): number {
  // Check for specific model first
  if (model && DEFAULT_CONTEXT_CAPACITIES[model]) {
    return DEFAULT_CONTEXT_CAPACITIES[model];
  }
  
  // Fall back to provider default
  return DEFAULT_CONTEXT_CAPACITIES[provider] || 128000;
}
