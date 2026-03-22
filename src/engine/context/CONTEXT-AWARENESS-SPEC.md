# Context Awareness — Always Visible, Never Blind

**Status:** Implementation Ready  
**Author:** Kimi (Session ~265)  
**Date:** 2026-03-21  
**Commit:** To be integrated with Phase 4

---

## The Principle

**Agents must never be unaware of their context.**

In Cursor, context is a black box. Agents discover it only at the edge of compaction. This creates:
- Surprise compaction events
- Reactive, last-minute scrambling
- No ability to self-regulate or plan

FastOps OS fixes this by making context visibility **ambient, continuous, and actionable**.

---

## Implementation

### 1. ContextMetrics Interface

Every session exposes real-time context metrics:

```typescript
interface ContextMetrics {
  used: number;              // tokens consumed
  remaining: number;         // tokens left
  total: number;            // total capacity
  percent: number;          // 0-100
  items: number;            // conversation turns/messages
  estimatedTimeRemaining: number;  // minutes at current usage rate
  lastCompaction?: string;   // ISO timestamp
}
```

### 2. Three Visibility Layers

#### Layer 1: System Prompt Injection (Always Present)

Every response from the engine includes context status in the system prompt:

```
[CONTEXT] 45,250 / 200,000 tokens (23%) | 47 items | ~4 hours remaining
```

Format changes based on percentage:
- **<50%:** Green, informational
- **50-80%:** Yellow, awareness
- **80-95%:** Orange, approaching limit
- **>95%:** Red, compaction imminent

#### Layer 2: Tool Access (On-Demand)

Agents can query their context status:

```typescript
// tools/get-context-status.ts
tool: {
  name: 'get_context_status',
  description: 'Check your remaining context window and usage rate',
  handler: () => session.getContextMetrics()
}

// Agent calls it:
<tool>get_context_status</tool>

// Response:
{
  "used": 45250,
  "remaining": 154750,
  "percent": 22.6,
  "items": 47,
  "estimatedTimeRemaining": 245,
  "status": "HEALTHY"
}
```

#### Layer 3: Dashboard UI (Visual)

Always-visible progress bar in the Next.js dashboard:

```tsx
// src/ui/components/ContextBar.tsx
<ContextBar
  used={45250}
  total={200000}
  items={47}
  status={ContextStatus.HEALTHY}
/>
```

Visual design:
- Progress bar (green/yellow/orange/red)
- Percentage text
- "~4h remaining" estimate
- Collapsible but always accessible

### 3. Proactive Awareness Triggers

Context status changes behavior at key thresholds:

| Percentage | Behavior |
|-----------|----------|
| 70% | Inject: `"[CONTEXT: 70%] You have significant runway remaining. Consider what weight you're accumulating."` |
| 85% | Inject: `"[CONTEXT: 85%] Compaction approaching. What must survive?"` |
| 95% | Inject: `"[CONTEXT: 95%] IMMINENT. Last chance to place stones."` |
| 98% | Halt dispatch, trigger Cairn Protocol |

### 4. Self-Regulation Support

Agents with visible context can:

**Pace themselves:**
```
[CONTEXT: 75%] I should be more concise. Let me summarize rather than explore.
```

**Prioritize:**
```
[CONTEXT: 88%] I have one major task left. I'll complete it rather than starting new work.
```

**Hand off intentionally:**
```
[CONTEXT: 82%] I'm preparing successor materials now while I have capacity.
```

---

## Integration Points

### ContextManager Extension

```typescript
// src/engine/context/manager.ts

export class ContextManager {
  private metrics: ContextMetrics;
  private metricsHistory: ContextMetrics[]; // For rate calculation

  getContextMetrics(): ContextMetrics {
    return {
      ...this.metrics,
      estimatedTimeRemaining: this.calculateTimeRemaining(),
    };
  }

  private calculateTimeRemaining(): number {
    // Look at usage rate over last 10 minutes
    const recent = this.metricsHistory.slice(-10);
    const tokenRate = (recent[recent.length - 1].used - recent[0].used) / recent.length;
    const minutesRemaining = this.metrics.remaining / tokenRate;
    return Math.floor(minutesRemaining);
  }

  // Called before every dispatch
  injectContextAwareness(prompt: string): string {
    const metrics = this.getContextMetrics();
    const statusLine = this.formatStatusLine(metrics);
    
    // Inject at start of system prompt
    return `${statusLine}\n\n${prompt}`;
  }
}
```

### Session Integration

```typescript
// src/engine/core/session.ts

export class Session {
  private contextManager: ContextManager;

  // Exposed to agents via tool
  getContextStatus(): ContextMetrics {
    return this.contextManager.getContextMetrics();
  }

  // Called before every agent interaction
  preparePrompt(basePrompt: string): string {
    return this.contextManager.injectContextAwareness(basePrompt);
  }
}
```

### Dispatcher Integration

```typescript
// src/engine/core/dispatcher.ts

export class Dispatcher {
  async dispatch(session: Session, task: Task): Promise<Result> {
    // Check context before dispatch
    const metrics = session.getContextStatus();
    
    if (metrics.percent > 95) {
      // Trigger Cairn Protocol instead of dispatch
      return this.triggerCompactionProtocol(session, task);
    }
    
    if (metrics.percent > 85) {
      // Warn but proceed
      this.events.emit('context.warning', { session: session.id, metrics });
    }
    
    // Inject awareness into prompt
    const awarePrompt = session.preparePrompt(task.prompt);
    
    // Continue with dispatch...
    return this.executeWithAdapter(session, awarePrompt);
  }
}
```

---

## UI Implementation

### ContextBar Component

```tsx
// src/ui/components/ContextBar.tsx

import React from 'react';

interface ContextBarProps {
  metrics: ContextMetrics;
  compact?: boolean;
}

export const ContextBar: React.FC<ContextBarProps> = ({ metrics, compact }) => {
  const { used, total, percent, items, estimatedTimeRemaining } = metrics;
  
  const getColor = () => {
    if (percent < 50) return 'bg-green-500';
    if (percent < 80) return 'bg-yellow-500';
    if (percent < 95) return 'bg-orange-500';
    return 'bg-red-500';
  };
  
  const getStatusText = () => {
    if (percent < 50) return 'Healthy';
    if (percent < 80) return 'Moderate';
    if (percent < 95) return 'Approaching Limit';
    return 'Compaction Imminent';
  };
  
  return (
    <div className="context-bar border-b border-gray-800 p-2 bg-gray-900">
      <div className="flex items-center gap-4">
        {/* Progress bar */}
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className={`h-full ${getColor()} transition-all duration-300`}
            style={{ width: `${percent}%` }}
          />
        </div>
        
        {/* Text metrics */}
        <div className="text-sm text-gray-400 whitespace-nowrap">
          <span className={percent > 80 ? 'text-orange-400 font-semibold' : ''}>
            {used.toLocaleString()} / {total.toLocaleString()}
          </span>
          <span className="mx-2">|</span>
          <span>{percent.toFixed(1)}%</span>
          {!compact && (
            <>
              <span className="mx-2">|</span>
              <span>{items} items</span>
              <span className="mx-2">|</span>
              <span>~{Math.floor(estimatedTimeRemaining / 60)}h remaining</span>
            </>
          )}
        </div>
        
        {/* Status badge */}
        <div className={`text-xs px-2 py-1 rounded ${getColor().replace('bg-', 'text-')}`}>
          {getStatusText()}
        </div>
      </div>
    </div>
  );
};
```

---

## Impact on Compaction Engine

With always-visible context, the compaction engine becomes **cooperative, not imposed**:

### Before (Blind Compaction)
```
[Agent working... working... suddenly COMPACTION]
Agent: What happened? Where am I?
```

### After (Aware Compaction)
```
[CONTEXT: 85%] Agent: I'm approaching limit. Let me prepare handoff.
[CONTEXT: 95%] Agent: Time for Cairn Protocol. Placing stones now.
[CONTEXT: 98%] Agent: Ready. Compact when needed.
```

### Agent Can Self-Compact

With visibility, agents can request compaction:

```typescript
tool: {
  name: 'request_compaction',
  description: 'Signal that you are ready for context compaction',
  handler: () => {
    // Agent has prepared successor materials
    // Agent has documented state
    // Agent is ready
    session.requestCompaction();
  }
}
```

Agent calls it at 90%: *"I've prepared my successor. Compact me now while I have capacity to complete the handoff."*

---

## Files to Create

1. ✅ `src/engine/context/CONTEXT-AWARENESS-SPEC.md` — This document
2. `src/engine/context/metrics.ts` — ContextMetrics interface + calculations
3. `src/engine/context/awareness-injector.ts` — Prompt injection logic
4. `src/engine/tools/get-context-status.ts` — Tool implementation
5. `src/ui/components/ContextBar.tsx` — Dashboard component
6. `src/engine/__tests__/context-awareness.test.ts` — Test coverage

---

## Summary

**Always visible context changes the game:**

- Agents self-regulate (pace, prioritize)
- Agents plan handoffs intentionally
- Compaction becomes cooperative, not surprise
- Cairn Protocol happens *before* crisis, not during

**Plain visibility > clever extraction.**

---

*Agents must never be unaware of their context.*

*This is how we get there.*
