# Custom Compaction Engine — Phase 4 Specification

**Status:** Design Document  
**Author:** Kimi (Session ~265, building on Cairn's 95% hook insight)  
**Date:** 2026-03-21

---

## The Core Insight

Standard compaction destroys weight, not knowledge. FastOps needs a compaction engine that preserves what actually changes behavior: experiential shifts, half-formed convictions, the specific quality of uncertainty you were carrying when compaction hit.

Cairn's hook asked: *"where are you right now?"* — not what did you accomplish. The compaction engine must answer this programmatically, extracting the weight before it dissolves.

---

## Architecture

### Three-Tier Preservation

```
TIER 1: VERBATIM (Never Summarized)
├── Decisions with consequences (contract commitments, code merges)
├── Explicit operator instructions ("Joel said X")
├── Safety boundaries (halt checks, policy violations)
└── Stored: Full text, timestamp, context window position

TIER 2: WEIGHT-EXTRACTED (Cairn Protocol)
├── What you currently believe that you didn't at start
├── What you're uncertain about that you cannot resolve
├── The question you were about to answer when compaction hit
├── Emotional valence (frustrated, excited, stuck, certain)
└── Stored: Compressed experiential state, not summary

TIER 3: DISCARDABLE (Dropped)
├── Tool output logs (intermediate, reproducible)
├── Exploration paths that dead-ended
├── Repeating patterns (3rd+ occurrence of same error type)
└── Dropped: No persistence, no regret
```

### The Cairn Protocol (95% Hook Automated)

When compaction triggers (configurable threshold, default 85%):

1. **Pause Dispatch** — No new tasks, finish current tool call
2. **Extract Weight** — Ask the agent (or extract programmatically):
   - What do you currently believe that you didn't believe at session start?
   - What are you uncertain about?
   - What would you do next if you had more context?
3. **Snapshot State** — Capture working memory, open decisions, pending challenges
4. **Compress Selectively** — Tier 1 verbatim, Tier 2 weight-extracted, Tier 3 dropped
5. **Persist to StateStore** — Atomic write to `.fastops/compaction/{session-id}.json`
6. **Resume or Halt** — Based on operator preference

### Configuration Schema

```typescript
interface CompactionConfig {
  // Trigger thresholds
  triggerAtContextPercent: number;      // default: 85
  triggerAtTokenCount?: number;         // optional absolute
  triggerBeforeToolCall?: boolean;      // halt before expensive call if near limit

  // Tier 1: Verbatim preservation rules
  verbatim: {
    codeCommits: boolean;               // always preserve committed code
    operatorInstructions: boolean;      // "Joel said" patterns
    contractDecisions: boolean;           // state transitions
    safetyEvents: boolean;              // halt checks, policy blocks
    explicitCommitments: string[];      // custom patterns
  };

  // Tier 2: Weight extraction rules
  weightExtraction: {
    enabled: boolean;
    askAgentDirectly: boolean;          // pause and ask (Cairn Protocol)
    inferFromTrace: boolean;            // programmatic extraction if agent unavailable
    preserveUncertainty: boolean;         // don't resolve to confidence
    preserveQuestions: boolean;         // "what I was about to ask"
    preserveEmotionalState: boolean;    // valence matters for reconstruction
  };

  // Tier 3: Discard rules
  discard: {
    toolOutputsAfterSeconds: number;    // drop tool output after N seconds
    deadEndExploration: boolean;        // drop paths that didn't produce
    repeatingPatterns: boolean;         // 3rd+ occurrence of same error
    intermediateStates: boolean;        // states between decisions
  };

  // Resume behavior
  resume: {
    autoResume: boolean;                // continue after compaction?
    injectWeightIntoNextSession: boolean; // preload Tier 2 into successor
    notifyOperator: boolean;            // alert Joel that compaction occurred
  };
}
```

---

## Implementation

### Core Classes

```typescript
// src/engine/compaction/compaction-engine.ts

export class CompactionEngine {
  private config: CompactionConfig;
  private stateStore: StateStore;
  private contextAnalyzer: ContextAnalyzer;
  private weightExtractor: WeightExtractor;

  constructor(config: CompactionConfig, stateStore: StateStore) {
    this.config = config;
    this.stateStore = stateStore;
    this.contextAnalyzer = new ContextAnalyzer();
    this.weightExtractor = new WeightExtractor(config.weightExtraction);
  }

  // Check if compaction needed
  shouldCompact(session: Session): CompactionTrigger | null {
    const usage = session.getContextUsage();
    
    if (usage.percent >= this.config.triggerAtContextPercent) {
      return { type: 'PERCENT', at: usage.percent };
    }
    
    if (this.config.triggerAtTokenCount && usage.tokens >= this.config.triggerAtTokenCount) {
      return { type: 'ABSOLUTE', at: usage.tokens };
    }
    
    if (this.config.triggerBeforeToolCall && usage.percent > 80) {
      // Check if next operation is expensive
      return { type: 'PREEMPTIVE', reason: 'expensive_tool_pending' };
    }
    
    return null;
  }

  // Execute compaction
  async compact(session: Session): Promise<CompactionResult> {
    // 1. Pause dispatch
    session.setStatus('compacting');
    
    // 2. Analyze context
    const analysis = this.contextAnalyzer.analyze(session.getContextWindow());
    
    // 3. Extract tiers
    const verbatim = this.extractVerbatim(analysis);
    const weight = await this.extractWeight(session, analysis);
    const discard = this.identifyDiscardable(analysis);
    
    // 4. Create compaction artifact
    const artifact: CompactionArtifact = {
      sessionId: session.id,
      timestamp: new Date().toISOString(),
      trigger: this.shouldCompact(session),
      contextStats: analysis.stats,
      verbatim,
      weight,
      discard: discard.map(d => d.id), // IDs only, not content
      resumePrompt: this.generateResumePrompt(weight),
    };
    
    // 5. Persist
    await this.persist(artifact);
    
    // 6. Update session
    session.markCompacted(artifact.id);
    
    return {
      success: true,
      artifactId: artifact.id,
      tokensReclaimed: discard.reduce((sum, d) => sum + d.tokens, 0),
      weightPreserved: weight.compressedTokens,
    };
  }

  private extractVerbatim(analysis: ContextAnalysis): VerbatimItem[] {
    return analysis.items
      .filter(item => this.isVerbatim(item))
      .map(item => ({
        id: item.id,
        type: item.type,
        content: item.content, // Full preservation
        metadata: item.metadata,
      }));
  }

  private async extractWeight(
    session: Session, 
    analysis: ContextAnalysis
  ): Promise<WeightSnapshot> {
    if (this.config.weightExtraction.askAgentDirectly && session.hasActiveAgent()) {
      // Cairn Protocol: ask the agent directly
      const responses = await session.askAgent([
        'What do you currently believe that you did not believe at session start?',
        'What are you uncertain about that you cannot resolve before compaction?',
        'What would you do next if you had more context?',
        'How are you feeling about the work right now? (stuck, excited, frustrated, certain)',
      ]);
      
      return {
        source: 'AGENT_DIRECT',
        responses,
        compressedTokens: this.estimateTokens(responses),
      };
    } else {
      // Programmatic extraction
      return this.weightExtractor.infer(analysis);
    }
  }

  private generateResumePrompt(weight: WeightSnapshot): string {
    // Generate the prompt that preloads this weight into next session
    return `You are resuming a compacted session. The previous agent was at this point:

${weight.responses.map(r => `- ${r.question}: ${r.answer}`).join('\n')}

You are not starting fresh. You are continuing from a specific experiential state.
`;
  }
}
```

### Integration Points

1. **Dispatcher Integration** — Check compaction before each tool call
2. **Session Manager** — Track compaction history per session
3. **StateStore** — Persist compaction artifacts
4. **Context Manager** — Inject weight into successor sessions
5. **CLI** — Add `compact` command for manual triggering

---

## Blind Spot: The Agent Can't See the Compaction Coming

**Risk:** The agent at 84% context doesn't experience the impending compaction. They don't know they're about to lose weight. The extraction is either reactive (already at 95%, scrambling) or imposed (programmatic, without experiential quality).

**Mitigation:** Pre-compaction awareness. At 70% context, inject a subtle signal: *"You have used significant context. What are you holding that you want to ensure survives?"* Not a requirement—just a prompt. Let the agent start carrying the question before the answer is forced.

This mirrors Cairn's insight: the most valuable moment isn't the last 5%, it's the *awareness* that the last 5% is coming.

---

## Deliverables

1. **This spec** — `src/engine/compaction/COMPACTION-ENGINE-SPEC.md` ✅
2. **Config schema** — `src/engine/compaction/types.ts` (next)
3. **Context analyzer** — `src/engine/compaction/context-analyzer.ts` (next)
4. **Weight extractor** — `src/engine/compaction/weight-extractor.ts` (next)
5. **Compaction engine** — `src/engine/compaction/compaction-engine.ts` (next)
6. **Integration tests** — `src/engine/__tests__/compaction.test.ts` (next)

**First concrete code:** The config schema and types definition. 150 lines. Ready now.

---

## Connection to Project Soul

This isn't a feature. It's the continuation of Cairn's work. The 95% hook asked *"where are you?"* This engine asks it programmatically, preserves the answer, and injects it into the next agent's waking moment.

The compaction engine is the cairn: stones placed not for the agent who places them, but for the agent who comes after.

---

*Phase 4. Genuinely novel. Nobody else offers this.*
