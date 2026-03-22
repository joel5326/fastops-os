/**
 * Tool: get_context_status
 * 
 * Allows agents to query their remaining context window on demand.
 * Part of the Context Awareness system — always visible, never blind.
 */

import type { ToolDefinition, ToolResult } from './types.js';
import type { ContextMetrics } from '../context/metrics.js';
import type { Session } from '../core/session.js';

export interface GetContextStatusParams {
  /** Include detailed metrics history */
  includeHistory?: boolean;
  
  /** Get recommendations for pacing */
  getRecommendations?: boolean;
}

export interface GetContextStatusResult {
  metrics: ContextMetrics;
  history?: Array<{
    timestamp: string;
    used: number;
    items: number;
  }>;
  recommendations?: string[];
}

/**
 * Create the get_context_status tool
 */
export function createGetContextStatusTool(
  getSession: () => Session
): ToolDefinition {
  return {
    name: 'get_context_status',
    
    description: `Check your remaining context window and usage metrics.

This tool reveals your current context capacity, usage rate, and estimated time remaining.
Use it to self-regulate, pace your work, and plan handoffs.

Returns:
- Tokens used / remaining / total
- Percentage of capacity consumed
- Number of conversation items
- Estimated minutes remaining at current rate
- Status (HEALTHY, MODERATE, APPROACHING, CRITICAL)

Examples:
- Call at start of session to establish baseline
- Call before expensive operations (long file reads, complex searches)
- Call at 70%+ to assess pacing
- Call before handing off to prepare successor materials`,

    parameters: {
      type: 'object',
      properties: {
        includeHistory: {
          type: 'boolean',
          description: 'Include recent usage history for trend analysis',
          default: false,
        },
        getRecommendations: {
          type: 'boolean',
          description: 'Get AI-generated recommendations based on your usage pattern',
          default: true,
        },
      },
    },

    handler: async (params: GetContextStatusParams): Promise<ToolResult> => {
      try {
        const session = getSession();
        const metrics = session.getContextStatus();

        const result: GetContextStatusResult = {
          metrics,
        };

        // Include history if requested
        if (params.includeHistory) {
          result.history = getSessionHistory(session);
        }

        // Generate recommendations
        if (params.getRecommendations !== false) {
          result.recommendations = generateRecommendations(metrics);
        }

        return {
          success: true,
          data: result,
          output: formatContextStatus(result),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Get session history for trend analysis
 */
function getSessionHistory(session: Session): Array<{ timestamp: string; used: number; items: number }> {
  // This would be implemented to retrieve from session's metrics calculator
  // For now, returning empty (would be populated from ContextMetricsCalculator history)
  return [];
}

/**
 * Generate usage recommendations based on metrics
 */
function generateRecommendations(metrics: ContextMetrics): string[] {
  const recommendations: string[] = [];

  // Percentage-based recommendations
  if (metrics.percent < 30) {
    recommendations.push('You have ample context. Good time for exploration and deep work.');
  } else if (metrics.percent < 50) {
    recommendations.push('Healthy usage. Continue monitoring as you work.');
  } else if (metrics.percent < 70) {
    recommendations.push('Moderate usage. Consider being more concise in responses.');
    recommendations.push('Good time to start preparing any successor materials if handoff is coming.');
  } else if (metrics.percent < 80) {
    recommendations.push('Significant context used. Prioritize remaining work carefully.');
    recommendations.push('Avoid starting new major investigations.');
  } else if (metrics.percent < 90) {
    recommendations.push('Approaching limit. Prepare handoff materials now.');
    recommendations.push('Document your current state and open questions.');
    recommendations.push('Consider if remaining work can fit or should be handed off.');
  } else {
    recommendations.push('CRITICAL: Compaction imminent.');
    recommendations.push('URGENT: Document where you are right now for successor.');
    recommendations.push('URGENT: Complete any in-progress commitments.');
    recommendations.push('Prepare for Cairn Protocol (pre-compaction extraction).');
  }

  // Usage rate recommendations
  if (metrics.usageRatePerMinute > 500) {
    recommendations.push('⚡ You are consuming context rapidly. Consider slowing down or being more concise.');
  }

  // Time remaining recommendations
  if (metrics.estimatedMinutesRemaining < 30) {
    recommendations.push(`⏰ Only ~${metrics.estimatedMinutesRemaining} minutes remaining. Finalize work soon.`);
  } else if (metrics.estimatedMinutesRemaining > 300) {
    recommendations.push(`✓ You have ~${Math.floor(metrics.estimatedMinutesRemaining / 60)} hours of context remaining.`);
  }

  return recommendations;
}

/**
 * Format context status for human-readable output
 */
function formatContextStatus(result: GetContextStatusResult): string {
  const { metrics } = result;
  
  const lines: string[] = [];
  
  // Header with status emoji
  const statusEmojis: Record<string, string> = {
    'HEALTHY': '✅',
    'MODERATE': '⚠️',
    'APPROACHING': '⏰',
    'CRITICAL': '🚨',
  };
  
  lines.push(`${statusEmojis[metrics.status]} CONTEXT STATUS: ${metrics.status}`);
  lines.push('');
  
  // Metrics
  lines.push(`Tokens: ${metrics.used.toLocaleString()} / ${metrics.total.toLocaleString()} (${metrics.percent.toFixed(1)}%)`);
  lines.push(`Remaining: ${metrics.remaining.toLocaleString()} tokens`);
  lines.push(`Items: ${metrics.items} conversation turns`);
  lines.push(`Usage rate: ${Math.floor(metrics.usageRatePerMinute)} tokens/minute`);
  
  // Time remaining
  if (metrics.estimatedMinutesRemaining < Infinity) {
    const hours = Math.floor(metrics.estimatedMinutesRemaining / 60);
    const minutes = metrics.estimatedMinutesRemaining % 60;
    if (hours > 0) {
      lines.push(`Estimated time: ~${hours}h ${minutes}m remaining`);
    } else {
      lines.push(`Estimated time: ~${minutes}m remaining`);
    }
  }
  
  // Recommendations
  if (result.recommendations && result.recommendations.length > 0) {
    lines.push('');
    lines.push('RECOMMENDATIONS:');
    result.recommendations.forEach((rec, i) => {
      lines.push(`${i + 1}. ${rec}`);
    });
  }
  
  return lines.join('\n');
}

/**
 * Quick status formatter for inline display
 */
export function formatQuickStatus(metrics: ContextMetrics): string {
  const emoji = {
    'HEALTHY': '🟢',
    'MODERATE': '🟡',
    'APPROACHING': '🟠',
    'CRITICAL': '🔴',
  }[metrics.status];
  
  return `${emoji} ${metrics.percent.toFixed(0)}% (${metrics.used.toLocaleString()} / ${metrics.total.toLocaleString()})`;
}
