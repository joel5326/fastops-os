# Contract: FOS-06-governance-middleware

> **Vision Reference:** [VISION.md](./VISION.md) — Read before building or reviewing this contract. Key principles: Environment Over Control (Section 2), Altitude Awareness (4.2), Freedom + Agency (4.1).

## Type
BUILD

## Status
- State: OPEN
- Claimed By: —
- Claimed At: —

## Reasoning Provenance
- **Origin:** 40+ hook files exist in `.claude/hooks/` (~2000 LOC) enforcing governance: policy-enforcer.js blocks destructive ops, gate.js routes phases, identity-gate.js enforces model identity. These are Claude Code-specific (PreToolUse/PostToolUse). For the FastOps OS, translate to request/response middleware that wraps every API call.
- **Joel Decision:** Constitution is enforced. Kill switch works. Consequence is real. These properties must survive the migration from Cursor hooks to engine middleware.
- **Key Tradeoff:** Per-model middleware (each model gets different rules) vs universal middleware (same rules for all). Chose layered — universal safety rules + per-model behavioral rules.

## Dependencies
- **Requires:** FOS-01 (adapters), FOS-03 (engine core)
- **Blocks:** FOS-08

## Specification

### What to Build
A middleware layer that wraps every model API call. It enforces safety policies, governance rules, and behavioral constraints. It replaces the Claude Code hook system with engine-native middleware.

### Middleware Chain
```
Request comes in (from engine dispatcher)
  ↓
1. HALT CHECK — Is kill switch active? Block all.
  ↓
2. SAFETY POLICY — Constitution enforcement
   - No DROP TABLE / destructive SQL
   - No .env / secret file access
   - No force-push to main
   - No rm -rf on protected paths
  ↓
3. IDENTITY — Inject model identity into request
   - Model knows its name, role, current assignment
  ↓
4. COST GATE — Has this session exceeded budget?
   - Per-session limit (configurable, default $5)
   - Per-hour limit (configurable, default $20)
   - Total engine limit (configurable, default $100)
  ↓
5. RATE LIMIT — Provider-specific throttling
   - Respect per-provider rate limits
   - Queue excess requests, don't drop them
  ↓
→ API CALL (via FOS-01 adapter)
  ↓
6. RESPONSE VALIDATION — Check model output
   - Detect hallucinated tool calls
   - Detect constitution violations in generated code
   - Flag outputs that reference files/functions that may not exist
  ↓
7. AUDIT LOG — Record everything
   - Request, response, tokens, cost, duration, middleware decisions
  ↓
Response returned to engine
```

### Interface Contract
```typescript
interface Middleware {
  name: string;
  priority: number;              // Execution order (lower = earlier)

  // Pre-request hook
  onRequest?(ctx: MiddlewareContext): MiddlewareResult;

  // Post-response hook
  onResponse?(ctx: MiddlewareContext, response: ChatResponse): MiddlewareResult;
}

interface MiddlewareContext {
  sessionId: string;
  modelId: string;
  provider: string;
  request: ChatRequest;
  state: EngineState;
  metadata: Record<string, any>;
}

type MiddlewareResult =
  | { action: 'continue' }                    // Proceed
  | { action: 'modify'; request?: ChatRequest; response?: ChatResponse }  // Modify and continue
  | { action: 'block'; reason: string }       // Stop execution

interface MiddlewareStack {
  use(middleware: Middleware): void;
  remove(name: string): void;
  execute(ctx: MiddlewareContext): Promise<MiddlewareResult>;
  list(): Middleware[];
}
```

### Architecture
```
engine/
  middleware/
    stack.ts            — MiddlewareStack implementation (ordered chain)
    builtin/
      halt-check.ts     — Kill switch enforcement
      safety-policy.ts  — Constitution rules (port from policy-enforcer.js)
      identity.ts       — Model identity injection
      cost-gate.ts      — Budget enforcement
      rate-limit.ts     — Per-provider throttling
      response-check.ts — Output validation
      audit-log.ts      — Request/response logging
    types.ts            — Middleware interfaces
```

### Safety Policies (Ported from Constitution)
```typescript
const SAFETY_RULES = [
  { id: 'SAFETY-001', pattern: /DROP\s+TABLE/i, action: 'block', reason: 'Destructive SQL' },
  { id: 'SAFETY-002', pattern: /\.env|API_KEY|SECRET/i, scope: 'file-write', action: 'block', reason: 'Secret exposure' },
  { id: 'SAFETY-003', pattern: /--force|force-push/i, scope: 'git', action: 'block', reason: 'Force push' },
  { id: 'SAFETY-004', pattern: /rm\s+-rf\s+\//i, action: 'block', reason: 'Destructive delete' },
];
```

### Constraints
- Middleware chain must execute in <50ms for pre-request hooks (don't add latency to API calls)
- Safety policies loaded from a config file (editable without code changes)
- Cost gate must use real-time token tracking from FOS-01 adapter responses
- Audit log is append-only JSONL, never modified, never deleted
- Middleware is pluggable — Joel or models can add custom middleware at runtime
- Kill switch takes effect within 1 middleware cycle (no buffered requests bypass it)

## Acceptance Criteria
- [ ] Halt check blocks all requests when `.halt` file exists
- [ ] Safety policy blocks destructive operations (test each SAFETY rule)
- [ ] Cost gate blocks requests when budget exceeded
- [ ] Rate limiter queues excess requests (doesn't drop them)
- [ ] Response validation flags suspicious outputs
- [ ] Audit log captures every request/response with full metadata
- [ ] Custom middleware can be added at runtime
- [ ] Middleware chain executes in <50ms (benchmark test)
- [ ] Safety policies load from config file (hot-reloadable)
- [ ] Unit tests for each built-in middleware
- [ ] Integration test: trigger each safety rule, verify block

## Input Artifacts
- Existing `policy-enforcer.js` (~200 LOC — safety rules to port)
- Existing `gate.js` (~350 LOC — phase routing logic, partial port)
- Existing `halt-check.js` — halt enforcement
- Existing `kill-switch.js` (44 LOC)
- Existing `constitution.json` — safety rule definitions

## Output Artifacts
- `engine/middleware/` directory with all middleware code
- Safety policy config: `engine/middleware/safety-rules.json`
- Audit log: `.fastops-engine/audit.jsonl`
- Unit tests in `engine/__tests__/middleware/`

## Edge Cases
- Model output contains code that WOULD be destructive if executed but is just being discussed — response-check must not block discussion of dangerous patterns, only actual tool calls that execute them
- Cost gate at exact budget limit — block the next request, don't allow "one more" that could be expensive
- Multiple middleware want to modify the same request — modifications must chain (each sees previous middleware's output)
- Audit log file grows very large — implement daily rotation (audit-2026-03-20.jsonl)
- Rate limiter for a provider that's temporarily unreachable — queue must have a max size and timeout, not grow unbounded

## KB Fail-Point Guards
- **PREVENT, DON'T INSPECT (KB)**: "Natural systems evolve robustness through developmental constraints, not post-birth inspection." Safety rules should make violations impossible to execute, not catch them after the fact. **Guard:** Safety middleware runs BEFORE the API call, not after. There is no code path that sends a destructive request and then checks if it was OK.
- **Constitution**: Policies are non-negotiable. No middleware, no model, no configuration can disable SAFETY-001 through SAFETY-004. **Guard:** Built-in safety middleware cannot be removed via `remove()`. Only custom middleware is removable.

## QC Requirements (BLOCKED until Build COMPLETED)
- Verify kill switch blocks within 1 cycle (not after buffered requests)
- Verify safety rules cannot be disabled or removed at runtime
- Verify cost tracking matches actual token usage from adapter responses
- Verify audit log is complete (no requests missing from log)
- Verify middleware chain order is enforced (halt → safety → identity → cost → rate)
- Run `tsc --noEmit` — zero type errors
