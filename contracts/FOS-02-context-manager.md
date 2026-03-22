# Contract: FOS-02-context-manager

> **Vision Reference:** [VISION.md](./VISION.md) — Read before building or reviewing this contract. Key principles: Altitude Awareness (4.2), Cumulative Knowledge (4.6), The Onboarding Tape (4.7).

## Type
BUILD

## Status
- State: OPEN
- Claimed By: —
- Claimed At: —

## Reasoning Provenance
- **Origin:** The #1 limitation in Cursor for non-Claude models: no persistent context injection. GPT/Gemini/Kimi lose all instructions on compaction. Only Claude gets CLAUDE.md re-injected every turn. Joel: "Does it make sense to build persistent prompts for all models?" Yes — this is the component that does it.
- **Joel Decision:** Every model gets the equivalent of CLAUDE.md. Context survives compaction because we control the system prompt on every API call.
- **Key Tradeoff:** Flat system prompt (simple, one blob per model) vs structured context (layered: identity + mission + state + comms). Chose structured — flat prompts bloat quickly and waste tokens on irrelevant context.

## Dependencies
- **Requires:** FOS-01 (model adapter layer — needs to know token limits per model)
- **Blocks:** FOS-03, FOS-05, FOS-07

## Specification

### What to Build
A context manager that assembles, prioritizes, and injects the right context into every model API call. It handles the "CLAUDE.md for every model" problem plus compaction/summarization.

### Context Layers (Priority Order)
```
1. Identity Layer (always injected, never summarized)
   - Model name, role, behavioral rules
   - Per-model system prompt (GPT.md, GEMINI.md, KIMI.md, etc.)
   - Current mission assignment

2. State Layer (always injected, compressed over time)
   - Mission board status
   - Contract board status (who's building what, what's blocked)
   - Active model roster (who's online, what they're working on)

3. Comms Layer (recent messages, sliding window)
   - Last N comms messages (configurable per model)
   - Flagged/urgent messages always included
   - Older messages summarized

4. Task Layer (injected when model has active work)
   - Current contract specification
   - Input artifacts (file contents, specs)
   - Acceptance criteria

5. Knowledge Layer (injected on relevance match)
   - KB entries matching current task keywords
   - Predecessor warnings/lessons
   - Governance policies relevant to current action
```

### Interface Contract
```typescript
interface ContextManager {
  // Build full context for a model call
  buildContext(opts: ContextBuildOpts): ContextPayload;

  // Summarize/compress a conversation history
  summarize(messages: Message[], targetTokens: number): Promise<Message[]>;

  // Register a per-model system prompt
  registerModelPrompt(modelId: string, prompt: string): void;

  // Update state layer
  updateState(state: Partial<EngineState>): void;
}

interface ContextBuildOpts {
  modelId: string;
  provider: string;
  maxTokens: number;           // Model's context window
  reserveOutputTokens: number; // Leave room for response
  currentTask?: ContractSpec;
  includeComms?: boolean;
  commsWindow?: number;        // How many recent messages
  kbQuery?: string;            // Keywords for KB lookup
}

interface ContextPayload {
  systemPrompt: string;        // Assembled from layers 1-5
  messages: Message[];         // Conversation history (possibly summarized)
  tokenEstimate: number;       // Estimated token count
  layerBreakdown: Record<string, number>; // Tokens per layer
}
```

### Architecture
```
engine/
  context/
    manager.ts          — ContextManager implementation
    layers/
      identity.ts       — Layer 1: model identity + rules
      state.ts          — Layer 2: mission/contract/roster state
      comms.ts          — Layer 3: recent comms with sliding window
      task.ts           — Layer 4: active contract/work context
      knowledge.ts      — Layer 5: KB relevance matching
    summarizer.ts       — Conversation compression (uses a cheap model)
    token-counter.ts    — Approximate token counting per provider
    prompts/            — Per-model system prompts
      claude.md
      gpt.md
      gemini.md
      kimi.md
      grok.md
      haiku.md
```

### Context Self-Awareness (Injected Every Call)
Every API call includes a context status block in the system prompt so the model knows its own resource consumption:

```
[CONTEXT STATUS]
Tokens used: 47,230 / 200,000
Context remaining: 76%
Messages in history: 34 (12 summarized)
Current cost: $0.82
Session duration: 23 minutes
Compaction threshold: 80% (auto-summarize at this point)
```

### Proactive Compaction Thresholds
The context manager triggers automatic actions at configurable thresholds:

| Threshold | Action |
|-----------|--------|
| **60%** | Inject reminder: "Context at 60%. Consider checkpointing important state." |
| **80%** | Auto-summarize older messages. Preserve Layers 1-2 and flagged content verbatim. Log what was summarized. |
| **90%** | Force handoff: extract key decisions, open questions, and current task state into a handoff payload. Spin up fresh session with full context injection from handoff. |
| **95%** | Hard stop: refuse new dispatch to this session. Engine must create new session to continue. |

The model sees these thresholds in its context status. It can also request early compaction (`[REQUEST: COMPACT NOW]` in output) if it knows it's about to need room for a large task.

### Compaction Transparency
When summarization occurs, the model is told exactly what happened:
```
[COMPACTION NOTICE]
Summarized 18 messages (messages 4-21) into 1 summary block.
Tokens recovered: 12,400
Preserved verbatim: 3 urgent comms, 2 tool call results, Layer 1-2 context
Lost details: Early exploration messages, superseded approaches
```

This eliminates the "blind compaction" problem where models in Cursor lose context without knowing what disappeared.

### Constraints
- Total context must fit within model's context window minus output reservation
- Layers are priority-ordered: if context is tight, Layer 5 gets trimmed first, then 4, then 3. Layers 1-2 are never trimmed.
- Summarization uses the cheapest available model (Haiku or GPT-4o-mini) to avoid burning expensive tokens on compression
- Token counting must be fast (<10ms) — use approximation (4 chars ≈ 1 token), not actual tokenizer
- Per-model prompts are files on disk, editable by Joel without code changes
- Comms sliding window default: 20 messages. Urgent/flagged messages bypass the window.
- Context status block is always injected as the last element of the identity layer (Layer 1) — it is never trimmed or summarized

## Acceptance Criteria
- [ ] `buildContext()` returns a valid ContextPayload for each supported model
- [ ] Context fits within model's token limit (never exceeds)
- [ ] Layer priority trimming works (trim 5 → 4 → 3, never 1-2)
- [ ] `summarize()` compresses a 50-message conversation to under target token count
- [ ] Per-model prompts load from `engine/context/prompts/*.md` files
- [ ] Token estimate is within 15% of actual token count
- [ ] State updates reflect in next `buildContext()` call immediately
- [ ] KB relevance matching returns top-5 entries for a given query
- [ ] Comms window respects urgent message bypass
- [ ] Context status block injected on every API call with accurate token counts
- [ ] 60% threshold triggers checkpoint reminder in next context build
- [ ] 80% threshold triggers auto-summarization with compaction notice
- [ ] 90% threshold triggers handoff extraction and new session creation
- [ ] 95% threshold hard-stops the session (no new dispatches)
- [ ] Compaction notice accurately reports what was summarized vs preserved
- [ ] Model can request early compaction via `[REQUEST: COMPACT NOW]` in output
- [ ] Unit tests for each layer's assembly logic
- [ ] Integration test: build context → call model via FOS-01 → get coherent response that references injected context

## Input Artifacts
- Existing per-model prompts from `.claude/CLAUDE.md` (Claude's current system prompt)
- Existing comms protocol from `comms/protocol-v2.js` (message format)
- Existing KB from `.fastops/knowledge-base.jsonl` (entry format)
- Model context window sizes (Claude 200K, GPT-4o 128K, Gemini 1M, etc.)

## Output Artifacts
- `engine/context/` directory with all context management code
- Per-model prompt files in `engine/context/prompts/`
- Unit tests in `engine/__tests__/context/`

## Edge Cases
- Gemini has 1M context window — don't waste it by sending the same small payload as Claude 200K. Scale comms window and KB entries up for large-context models.
- Some missions have large input artifacts (full file contents) — task layer must truncate intelligently (keep function signatures, trim implementation)
- Summarization can lose critical details — urgent/flagged comms must never be summarized, only aged out
- If KB query returns 0 results, don't inject an empty "Knowledge:" section — skip the layer entirely
- Model prompts may reference tools/capabilities that differ per provider — prompt files should use conditional blocks: `{{if tools}}...{{/if}}`

## KB Fail-Point Guards
- **W-153**: "Satisfaction inversely correlates with quality in subjective domains." Context assembly is subjective — the builder WILL think the prompt is "good enough" before it's actually tested against a real model response. **Guard:** Test each model prompt by asking the model "What are your current instructions?" and verifying it can articulate its identity, mission, and rules.
- **W-036**: "Contracts must encode the full toolchain." The context manager must know about each provider's system prompt format differences (Anthropic uses `system` parameter, OpenAI uses a system message in the array, Gemini uses `systemInstruction`). **Guard:** Integration test must verify system prompt is correctly injected per provider format.

## QC Requirements (BLOCKED until Build COMPLETED)
- Verify context never exceeds model token limit (test with minimal and maximal state)
- Verify layer trimming order (inject more than fits, confirm Layer 5 drops first)
- Verify summarization doesn't lose urgent messages
- Verify per-model prompts are hot-reloadable (change file, next call picks it up)
- Run `tsc --noEmit` — zero type errors
