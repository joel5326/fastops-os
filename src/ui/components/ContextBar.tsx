/**
 * ContextBar Component
 * 
 * Always-visible context window status for the FastOps OS dashboard.
 * Real-time awareness of token usage, item count, and time remaining.
 */

import React, { useState, useEffect } from 'react';
import type { ContextMetrics, ContextStatus } from '../../engine/context/metrics';

interface ContextBarProps {
  /** Current context metrics */
  metrics: ContextMetrics;
  
  /** Compact mode (just percentage) vs full mode */
  compact?: boolean;
  
  /** Callback when user requests compaction */
  onRequestCompaction?: () => void;
  
  /** Show detailed history */
  showHistory?: boolean;
}

export const ContextBar: React.FC<ContextBarProps> = ({
  metrics,
  compact = false,
  onRequestCompaction,
  showHistory = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [pulse, setPulse] = useState(false);

  // Pulse animation on critical status
  useEffect(() => {
    if (metrics.status === 'CRITICAL') {
      const interval = setInterval(() => setPulse(p => !p), 1000);
      return () => clearInterval(interval);
    }
  }, [metrics.status]);

  const getStatusColor = (status: ContextStatus): string => {
    const colors: Record<ContextStatus, string> = {
      'HEALTHY': 'bg-green-500',
      'MODERATE': 'bg-yellow-500',
      'APPROACHING': 'bg-orange-500',
      'CRITICAL': 'bg-red-500',
    };
    return colors[status];
  };

  const getStatusTextColor = (status: ContextStatus): string => {
    const colors: Record<ContextStatus, string> = {
      'HEALTHY': 'text-green-400',
      'MODERATE': 'text-yellow-400',
      'APPROACHING': 'text-orange-400',
      'CRITICAL': 'text-red-400 font-bold',
    };
    return colors[status];
  };

  const getStatusLabel = (status: ContextStatus): string => {
    const labels: Record<ContextStatus, string> = {
      'HEALTHY': 'Healthy',
      'MODERATE': 'Moderate',
      'APPROACHING': 'Approaching Limit',
      'CRITICAL': 'CRITICAL',
    };
    return labels[status];
  };

  const formatTimeRemaining = (minutes: number): string => {
    if (minutes === Infinity) return 'Calculating...';
    if (minutes < 1) return '< 1m';
    
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    
    if (hours > 0) {
      return `~${hours}h ${mins}m`;
    }
    return `~${mins}m`;
  };

  // Compact mode: just percentage and status
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-900 rounded">
        <div className={`w-2 h-2 rounded-full ${getStatusColor(metrics.status)} ${pulse ? 'animate-pulse' : ''}`} />
        <span className={`text-sm ${getStatusTextColor(metrics.status)}`}>
          {metrics.percent.toFixed(0)}%
        </span>
      </div>
    );
  }

  return (
    <div 
      className={`context-bar border-b border-gray-800 bg-gray-900 transition-all ${
        metrics.status === 'CRITICAL' ? 'bg-red-900/20' : ''
      }`}
    >
      {/* Main bar */}
      <div 
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-800/50"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Status indicator */}
        <div className={`w-3 h-3 rounded-full ${getStatusColor(metrics.status)} ${pulse ? 'animate-pulse' : ''}`} />
        
        {/* Progress bar */}
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className={`h-full ${getStatusColor(metrics.status)} transition-all duration-500`}
            style={{ width: `${Math.min(metrics.percent, 100)}%` }}
          />
        </div>
        
        {/* Metrics */}
        <div className="text-sm text-gray-400 whitespace-nowrap flex items-center gap-3">
          <span className={getStatusTextColor(metrics.status)}>
            {metrics.percent.toFixed(1)}%
          </span>
          <span className="text-gray-600">|</span>
          <span>{metrics.used.toLocaleString()} / {metrics.total.toLocaleString()}</span>
          <span className="text-gray-600">|</span>
          <span>{metrics.items} items</span>
          <span className="text-gray-600">|</span>
          <span>{formatTimeRemaining(metrics.estimatedMinutesRemaining)}</span>
        </div>
        
        {/* Status badge */}
        <div className={`text-xs px-2 py-1 rounded border ${
          metrics.status === 'CRITICAL' 
            ? 'border-red-500 text-red-400 animate-pulse' 
            : 'border-gray-700 text-gray-400'
        }`}>
          {getStatusLabel(metrics.status)}
        </div>
        
        {/* Expand/collapse */}
        <span className="text-gray-600 text-xs">
          {expanded ? '▼' : '▶'}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800 bg-gray-900/50">
          <div className="grid grid-cols-2 gap-4 mt-3">
            {/* Left column: Metrics */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase">Metrics</h4>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Used:</span>
                <span className="text-gray-200">{metrics.used.toLocaleString()} tokens</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Remaining:</span>
                <span className={getStatusTextColor(metrics.status)}>
                  {metrics.remaining.toLocaleString()} tokens
                </span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Items:</span>
                <span className="text-gray-200">{metrics.items} conversation turns</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Usage rate:</span>
                <span className="text-gray-200">
                  {Math.floor(metrics.usageRatePerMinute)} tokens/min
                </span>
              </div>
            </div>

            {/* Right column: Actions */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase">Actions</h4>
              
              {onRequestCompaction && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestCompaction();
                  }}
                  disabled={metrics.percent < 50}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    metrics.percent >= 80
                      ? 'bg-orange-900/30 text-orange-300 hover:bg-orange-900/50'
                      : 'bg-gray-800 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Request Compaction (prepare handoff)
                </button>
              )}
              
              <div className="text-xs text-gray-500 mt-2">
                {metrics.percent < 50 && 'You have ample context for deep work.'}
                {metrics.percent >= 50 && metrics.percent < 80 && 'Monitor usage as you work.'}
                {metrics.percent >= 80 && metrics.percent < 95 && 'Prepare handoff materials soon.'}
                {metrics.percent >= 95 && 'URGENT: Document state for successor now.'}
              </div>
            </div>
          </div>

          {/* History graph placeholder */}
          {showHistory && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Usage History</h4>
              <div className="h-24 bg-gray-800 rounded flex items-end px-2 pb-2 gap-1">
                {/* Placeholder bars */}
                {[20, 35, 45, 60, 55, 70, 65, 80, 75, 90].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-gray-600 rounded-t"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ContextBar;
