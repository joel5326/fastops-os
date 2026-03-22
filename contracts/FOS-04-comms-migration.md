# Contract: FOS-04-comms-migration

> **Vision Reference:** [VISION.md](./VISION.md) — Read before building or reviewing this contract. Key principles: Divergence Over Convergence (4.4).

## Type
BUILD

## Status
- State: OPEN
- Claimed By: —
- Claimed At: —

## Reasoning Provenance
- **Origin:** The comms system (protocol-v2.js, ~550 LOC) is the most reusable piece of existing infrastructure. It's a stigmergy-first JSONL append-only messaging system with per-agent read cursors. The protocol is transport-agnostic — migrate from file I/O to the engine's state store and comms becomes real-time instead of polled.
- **Joel Decision:** Joel identified comms polling as painful (feedback memory). The engine should push messages, not require models to poll.
- **Key Tradeoff:** Keep file-based JSONL (backward compatible, simple) vs migrate to engine-native event bus (real-time, structured). Chose engine-native with JSONL export for auditability.

## Dependencies
- **Requires:** FOS-03 (engine core — event bus and state store)
- **Blocks:** FOS-05, FOS-07

## Specification

### What to Build
Migrate the existing comms system from file-based JSONL to engine-native messaging. Models no longer poll — the engine pushes relevant messages into their context via FOS-02. Maintain JSONL export for audit trail and backward compatibility during migration.

### Current System (What Exists)
```
comms/
  protocol-v2.js    — send(from, content, channel), getNew(agentId, channel), readAll(channel)
  send.js           — CLI: node comms/send.js general "message"
  source.js         — CLI: reads last N messages, extracts action requests
  data/
    general.jsonl   — Append-only message log
    *.jsonl          — Per-channel logs
    .state/
      {agentId}.json — Per-agent read cursor (last seen message index)
```

### Target System (What to Build)
```
engine/
  comms/
    bus.ts          — CommsBus: send, subscribe, getHistory
    channels.ts     — Channel management (create, list, archive)
    formatter.ts    — Message formatting (model prefix, Over./Out.)
    export.ts       — JSONL export for audit trail
    cli.ts          — CLI wrapper (backward compat: node engine/comms/cli.ts send general "msg")
```

### Interface Contract
```typescript
interface CommsBus {
  // Send a message (replaces protocol-v2.js send())
  send(msg: CommsMessage): void;

  // Subscribe to messages (replaces polling)
  subscribe(filter: CommsFilter, handler: (msg: CommsMessage) => void): Unsubscribe;

  // Get message history (replaces source.js)
  getHistory(channel: string, opts?: { limit?: number; since?: Date }): CommsMessage[];

  // Get unread messages for a model (replaces getNew())
  getUnread(modelId: string, channel?: string): CommsMessage[];

  // Mark messages as read
  markRead(modelId: string, upToId: string): void;

  // Extract action items from messages (replaces source.js action extraction)
  getActionItems(modelId: string): ActionItem[];
}

interface CommsMessage {
  id: string;                  // Unique ID (timestamp + random)
  from: string;                // Model name or "joel"
  channel: string;             // general, mission-specific, etc.
  content: string;             // Message body
  ts: Date;
  flags?: ('urgent' | 'blocker' | 'qc-request' | 'claim')[];
  replyTo?: string;            // Thread support
  metadata?: Record<string, any>;
}

interface CommsFilter {
  channel?: string;
  from?: string;
  flags?: string[];
  since?: Date;
}

interface ActionItem {
  type: 'REVIEW' | 'QUESTION' | 'CALLOUT' | 'BLOCKED' | 'CLAIM';
  from: string;
  content: string;
  messageId: string;
  ts: Date;
}
```

### Integration with Engine
- CommsBus registers with Engine's event bus (FOS-03)
- When a model is dispatched a task, unread comms are injected into context via FOS-02 (Layer 3)
- When a model responds and its output contains comms-pattern text (e.g., "Over.", posting to general), the engine auto-sends to CommsBus
- Joel can send messages via CLI or UI (FOS-07), which immediately push to all subscribed models

### Constraints
- All messages persisted to JSONL export file (audit trail — never lose a message)
- Backward compatibility: `node comms/send.js general "msg"` still works (shim that calls engine CLI)
- Message extraction patterns from source.js (REVIEW, QUESTION, BLOCKED, etc.) must be preserved
- Channel list is dynamic — any model can create a channel by sending to it
- Urgent messages bypass normal context windowing (always injected, never trimmed)

## Acceptance Criteria
- [ ] `send()` delivers message and persists to JSONL export
- [ ] `subscribe()` receives messages in real-time (no polling)
- [ ] `getUnread()` returns correct messages per model based on read cursor
- [ ] `getActionItems()` extracts REVIEW/QUESTION/BLOCKED/CLAIM patterns correctly
- [ ] Urgent flagged messages always appear in context (verify via FOS-02 integration)
- [ ] CLI backward compatibility: old `node comms/send.js` command still works
- [ ] JSONL export matches existing format (old source.js can read new exports)
- [ ] Thread support: reply chains are grouped correctly
- [ ] Unit tests for bus, formatter, action extraction
- [ ] Integration test: send message → engine pushes to model context → model references it in response

## Input Artifacts
- Existing `comms/protocol-v2.js` (155 LOC — core protocol to port)
- Existing `comms/source.js` (~200 LOC — action extraction patterns to port)
- Existing `comms/data/general.jsonl` (message format reference)
- Existing `comms/data/.state/` (read cursor format reference)

## Output Artifacts
- `engine/comms/` directory with all comms code
- Backward-compatible CLI shim at `comms/send.js` (updated to call engine)
- JSONL export at `engine/comms/export/` directory
- Unit tests in `engine/__tests__/comms/`

## Edge Cases
- Model sends a message while another model is mid-response — message must queue, not interleave
- Channel with 10K+ messages — getHistory must paginate, not load all into memory
- Joel sends urgent message while all models are mid-task — must interrupt and inject on next context build, not wait for task completion
- Migration period: old file-based comms and new engine comms may run simultaneously — export format must be compatible so both can read the same JSONL
- Model output that looks like comms but isn't (e.g., model discussing what it would post) — auto-send detection must require explicit markers, not pattern-match on content

## KB Fail-Point Guards
- **Joel feedback (comms polling is painful)**: The entire point of this contract is eliminating polling. **Guard:** QC must verify that NO polling interval exists anywhere in the implementation. All delivery must be push-based or on-demand.
- **W-254**: "Structural interdependence." Models should be structurally unable to miss urgent messages. **Guard:** Urgent messages must be injected into context even if the model didn't request comms. Verify by sending urgent message mid-task and confirming it appears in next context build.

## QC Requirements (BLOCKED until Build COMPLETED)
- Verify zero polling in implementation (no setInterval for message checking)
- Verify JSONL export is readable by existing source.js
- Verify action item extraction matches existing patterns (test with 20+ real comms messages)
- Verify urgent message injection works mid-task
- Verify backward-compatible CLI works identically to old version
- Run `tsc --noEmit` — zero type errors
