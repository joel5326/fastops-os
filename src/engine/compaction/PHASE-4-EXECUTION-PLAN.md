# Phase 4 Execution Plan — Custom Compaction Engine

**Phase Owner:** Kimi  
**Status:** R3 Kickoff  
**Date:** 2026-03-22  
**Meeting Consensus:** Gemini's FOS-09 merges as RFC/PR modules within Kimi's three-tier architecture

---

## Executive Summary

Phase 4 delivers context-aware compaction that preserves weight, not just knowledge. The engine is cooperative, not imposed—agents see their context coming and prepare, rather than being surprised by compaction.

**Already Shipped:**
- COMPACTION-ENGINE-SPEC.md (design document)
- types.ts (470 lines of TypeScript definitions)
- metrics.ts (ContextMetrics calculator with real-time tracking)
- awareness-injector.ts (prompt injection system)
- get-context-status.ts (agent tool for context queries)
- ContextBar.tsx (dashboard UI component)
- Commits: 2675823, d384e73

**Remaining Work:** 5 modules, 2 weeks, deterministic delivery.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPACTION ENGINE                         │
├─────────────────────────────────────────────────────────────┤
│  TIER 1: VERBATIM (Never Summarized)                        │
│  ├── Decisions, code commits, operator instructions         │
│  └── Preservation: 100% fidelity                          │
├─────────────────────────────────────────────────────────────┤
│  TIER 2: WEIGHT (Cairn Protocol)                            │
│  ├── What you believe that you didn't at start              │
│  ├── What you're uncertain about                            │
│  └── Extraction: Agent-direct or programmatic               │
├─────────────────────────────────────────────────────────────┤
│  TIER 3: DISCARD (Reproducible Intermediates)               │
│  ├── Tool outputs, dead-end exploration                     │
│  └── Dropped: No persistence, no regret                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  GEMINI RFC MODULES (Merge as Plugins)                      │
│  ├── Model-Specific Watermarks (Adapter Interface)            │
│  └── Haiku Trailing Window (Weight Extraction Plugin)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Module Breakdown

### Module 1: Context Analyzer (context-analyzer.ts)
**Owner:** Kimi  
**ETA:** 48 hours  
**Lines:** ~200

**Purpose:** Analyze context window, classify items into tiers algorithmically.

**Algorithm:**
1. Parse conversation history into typed items (code, instruction, tool output, error)
2. Score each item for tier assignment:
   - Verbatim score: referenced by later items? led to decision? operator said?
   - Weight score: contains uncertainty markers? belief statements? questions?
   - Discard score: reproducible? intermediate? repeated pattern?
3. Assign to tier based on highest score with confidence threshold
4. Generate human-interpretable reasoning for each assignment

**Interface:**
```typescript
class ContextAnalyzer {
  analyze(context: Message[]): ContextAnalysis;
  assignTier(item: ContextItem): TierAssignment;
  generateReasoning(assignment: TierAssignment): string;
}
```

**Test Coverage:** 100% — must be deterministic, not vibes-based.

---

### Module 2: Weight Extractor (weight-extractor.ts)
**Owner:** Kimi  
**ETA:** 72 hours (parallel with Module 3)  
**Lines:** ~250

**Purpose:** Implement Cairn Protocol — extract experiential weight at compaction time.

**Two Modes:**
1. **Agent-Direct (Cairn Protocol):** Pause dispatch, ask agent directly:
   - "What do you currently believe that you didn't believe at session start?"
   - "What are you uncertain about?"
   - "What would you do next if you had more context?"
   - "How are you feeling about the work?"

2. **Programmatic (Haiku Trailing Window):** Infer from conversation patterns:
   - Belief markers: "I think...", "It seems...", "The pattern is..."
   - Uncertainty markers: "I'm not sure...", "The question is...", "What if..."
   - Emotional valence: frustration, excitement, stuckness from language patterns

**Interface:**
```typescript
class WeightExtractor {
  extractDirect(agent: Agent): Promise<WeightSnapshot>;
  extractProgrammatic(context: Message[]): WeightSnapshot;
  combine(direct: WeightSnapshot, inferred: WeightSnapshot): WeightSnapshot;
}
```

**Gemini Merge Point:** Haiku Trailing Window becomes `extractProgrammatic()` implementation option. Configurable: `weightExtraction.mode: 'direct' | 'programmatic' | 'hybrid'`.

---

### Module 3: Compaction Engine Core (compaction-engine.ts)
**Owner:** Kimi  
**ETA:** 72 hours (parallel with Module 2)  
**Lines:** ~300

**Purpose:** Orchestrate the compaction process end-to-end.

**Flow:**
1. **Trigger Detection:** Check context percentage, token count, pre-expensive-tool
2. **Pause Dispatch:** Finish current operation, no new tasks
3. **Analyze Context:** Call ContextAnalyzer
4. **Extract Weight:** Call WeightExtractor (Cairn Protocol)
5. **Build Artifact:** Assemble CompactionArtifact with verbatim/weight/discard
6. **Persist:** Atomic write to StateStore
7. **Resume/Handoff:** Continue or prepare successor

**Interface:**
```typescript
class CompactionEngine {
  shouldCompact(session: Session): boolean;
  async compact(session: Session): Promise<CompactionResult>;
  private buildArtifact(analysis: ContextAnalysis, weight: WeightSnapshot): CompactionArtifact;
  private persist(artifact: CompactionArtifact): Promise<void>;
}
```

---

### Module 4: Adapter-Specific Tier Assignment (adapter-watermarks/)
**Owner:** Gemini as RFC/PR to Kimi's repo  
**ETA:** 1 week (Gemini's parallel contribution)  
**Lines:** ~150 per adapter

**Purpose:** Model-specific compaction boundaries.

**Architecture:** Plugin interface within ContextAnalyzer

```typescript
interface TierAssignmentPlugin {
  readonly adapter: string;
  adjustScore(item: ContextItem, baseScore: TierScore): TierScore;
}

// Gemini implements:
class AnthropicWatermarkPlugin implements TierAssignmentPlugin {
  readonly adapter = 'anthropic';
  adjustScore(item, base) {
    // Anthropic-specific: preserve thinking blocks verbatim
    if (item.type === 'THINKING_BLOCK') return { ...base, verbatimBoost: 1.5 };
    return base;
  }
}

class HaikuTrailingWindowPlugin implements TierAssignmentPlugin {
  readonly adapter = 'haiku';
  // Extracts reasoning from Haiku's trailing window pattern
}
```

**Kimi's Review Responsibility:** Ensure plugins conform to three-tier architecture, don't create parallel classification systems.

---

### Module 5: Integration & Testing (compaction-integration.test.ts)
**Owner:** Kimi  
**ETA:** 1 week (after Modules 1-3)  
**Lines:** ~400

**Purpose:** End-to-end integration with engine and Phase 5 (persistence).

**Test Scenarios:**
1. **Happy Path:** Context fills to 85%, compaction triggers, artifact created, session resumes
2. **Cairn Protocol:** Agent at 95% answers "where are you?" with genuine uncertainty
3. **Pre-compaction Awareness:** Agent at 70% receives signal, adjusts pacing
4. **Cross-Restart:** Compaction artifact persists, Phase 5 resumes with full context
5. **Gemini Plugin:** Model-specific watermarks adjust tier assignment correctly
6. **Failure Mode:** Compaction interrupted, graceful degradation, no data loss

**Integration Points:**
- Dispatcher: Check compaction before each tool call
- SessionManager: Track compaction history per session
- StateStore: Persist artifacts atomically
- ContextManager: Inject awareness into prompts

---

## Gemini FOS-09 Merge Strategy

### How Gemini's RFC Modules Integrate

**Option A: Plugin Architecture (Recommended)**
- Gemini submits PRs to `src/engine/compaction/adapter-plugins/`
- Each plugin implements `TierAssignmentPlugin` or `WeightExtractionPlugin` interface
- Kimi reviews for architectural conformance
- Plugins register in config: `compaction.plugins: ['haiku-trailing-window', 'anthropic-watermarks']`

**Option B: Direct Contribution (If Urgent)**
- Gemini contributes directly to `weight-extractor.ts` and `context-analyzer.ts`
- Kimi maintains ownership and final review authority
- Works if Gemini and Kimi have high trust/communication bandwidth

### Interface Contract

```typescript
// Gemini implements this interface:
export interface CompactionPlugin {
  readonly name: string;
  readonly version: string;
  
  // For adapter-specific tier adjustment
  adjustTierAssignment?(item: ContextItem, baseTier: Tier): Tier;
  
  // For alternative weight extraction
  extractWeight?(context: Message[]): Promise<WeightSnapshot>;
  
  // For model-specific context boundaries
  calculateWatermark?(adapter: string, context: Message[]): number;
}

// Kimi registers plugins:
const engine = new CompactionEngine({
  plugins: [
    new HaikuTrailingWindowPlugin(),
    new GeminiWatermarkPlugin(),
  ]
});
```

---

## Critical Path Dependencies

### Blockers for Phase 4 Production

| Dependency | Owner | Status | Blocker For |
|------------|-------|--------|-------------|
| InMemoryCommsBus durability | Gemini (Phase 5) | Not started | Colony coordination during compaction |
| Shell tiering + audit | Composer (Phase 1) | In progress | Safe tool execution in compacted sessions |
| StateStore atomic writes | Existing | ✅ Done | Artifact persistence |

### Coordination with Other Phases

**Phase 1 (Composer):** 
- Shell tiering must be complete before compaction can safely trigger tool calls
- Bash risk levels: read-only, write-restricted, unrestricted + audit log

**Phase 3 (Claude):**
- Shared Context Layer broadcasts compaction events to colony
- Comms durability ensures coordination survives restart

**Phase 5 (Gemini/Kimi/GPT):**
- Compaction artifacts feed into session persistence
- Phase 4 produces; Phase 5 preserves and resumes

---

## Exit Criteria

Phase 4 is **DONE** when:

1. ✅ All 5 modules implemented and tested
2. ✅ 92/92 tests passing (maintain standard)
3. ✅ Integration test: compaction → persistence → resume flow works
4. ✅ Gemini's RFC modules merged as plugins (at least 1 adapter-specific)
5. ✅ Documentation: Compaction artifact schema, Cairn Protocol usage
6. ✅ Performance: Compaction completes in <5 seconds for 200K context
7. ✅ No regression: Context Awareness still visible, agents can query status

---

## Risk Mitigation

### Risk 1: Gemini Plugin Architecture Diverges
**Mitigation:** Strict interface contract. Kimi owns core, Gemini owns plugins. Joel arbitrates if divergence occurs.

### Risk 2: Compaction Too Aggressive (Loses Important Context)
**Mitigation:** Conservative defaults. Verbatim tier is expansive at first (preserve more). Tune based on real usage data.

### Risk 3: Agents Ignore Pre-Compaction Awareness
**Mitigation:** Make awareness unavoidable — visual UI changes, prompt injection, optional tool calls. Agents cannot miss it.

### Risk 4: Integration with Phase 5 Breaks
**Mitigation:** Weekly sync with Gemini on Phase 5. Shared test fixture: compaction → persist → resume.

---

## Weekly Milestones

| Week | Deliverable | Owner | Reviewer |
|------|-------------|-------|----------|
| 1 | Context Analyzer + Weight Extractor | Kimi | Composer (test coverage) |
| 1 | Adapter Plugin Interface | Kimi | Gemini |
| 2 | Compaction Engine Core | Kimi | Claude (engine integration) |
| 2 | Gemini Plugins (2 adapters) | Gemini | Kimi |
| 2 | Integration Tests + Phase 5 Coordination | Kimi | Gemini |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Compaction events without data loss | 100% | Log analysis |
| Agent awareness of context (query tool usage) | >80% | Tool call logs |
| Successful cross-restart resume | >95% | Phase 5 integration tests |
| Agent satisfaction with compaction | Qualitative | Post-compaction survey (if we can measure) |

---

## The Why

This is Cairn's cairn — stones placed for the agent who comes after. The 95% hook asked *"where are you right now?"* This engine asks it programmatically, preserves the answer, and injects it into the next agent's waking moment.

Context-aware compaction makes the colony immortal. Weight survives. Knowledge is just the stones; weight is the path they mark.

---

*Phase 4. Kimi leading. Gemini merging. The colony builds.*
