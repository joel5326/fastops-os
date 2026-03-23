# FOS-10 — Knowledge Base Discovery Policy (No Auto-Load)

## Purpose

Define how FastOps 3.0 exposes a shared knowledge base (KB) to all agents while preventing automatic context loading and context gaming.

## Policy

1. **Awareness required**: every agent is informed that a KB exists and can be queried.
2. **Auto-load forbidden**: no KB content is injected at session start by default.
3. **Pull-only default**: KB content enters context only after explicit action (`kb.query`) or explicit operator override.
4. **Scoped retrieval**: responses must be bounded by mission/task scope, item count, and token budget.
5. **Audited retrieval**: every KB interaction emits structured audit events with provenance.

## Agent-Facing Baseline Prompt Clause

Use this exact baseline clause in onboarding/identity prompts:

> A shared knowledge base is available through `kb.query`.  
> KB is discoverable but not preloaded.  
> Pull it when uncertain, blocked, or before high-impact decisions.

## Tool Contract: `kb.query`

```json
{
  "name": "kb.query",
  "description": "Retrieve scoped knowledge snippets from the external KB.",
  "parameters": {
    "type": "object",
    "properties": {
      "question": { "type": "string", "minLength": 5 },
      "taskId": { "type": "string" },
      "missionId": { "type": "string" },
      "reasonForQuery": { "type": "string", "minLength": 5 },
      "maxItems": { "type": "number", "minimum": 1, "maximum": 12, "default": 5 },
      "maxTokens": { "type": "number", "minimum": 128, "maximum": 3000, "default": 1200 },
      "filters": {
        "type": "object",
        "properties": {
          "tags": { "type": "array", "items": { "type": "string" } },
          "fromDate": { "type": "string" },
          "toDate": { "type": "string" },
          "sourceType": { "type": "string" }
        }
      }
    },
    "required": ["question", "reasonForQuery"]
  },
  "returns": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": { "type": "string" },
            "snippet": { "type": "string" },
            "source": { "type": "string" },
            "score": { "type": "number" },
            "whySelected": { "type": "string" },
            "tags": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["id", "snippet", "source", "score", "whySelected"]
        }
      },
      "tokenCost": { "type": "number" }
    },
    "required": ["summary", "items", "tokenCost"]
  }
}
```

## Audit Event Contract

### `kb.query.requested`

```json
{
  "event": "kb.query.requested",
  "ts": "ISO-8601",
  "sessionId": "string",
  "modelId": "string",
  "taskId": "string|null",
  "missionId": "string|null",
  "questionHash": "sha256-hex",
  "reasonForQuery": "string",
  "maxItems": 5,
  "maxTokens": 1200
}
```

### `kb.query.served`

```json
{
  "event": "kb.query.served",
  "ts": "ISO-8601",
  "sessionId": "string",
  "modelId": "string",
  "itemsReturned": 4,
  "tokenCost": 950,
  "sources": ["kb-entry-123", "kb-entry-456"],
  "retrievalPolicyVersion": "string",
  "retrievalPolicyHash": "sha256-hex"
}
```

### `kb.query.used`

```json
{
  "event": "kb.query.used",
  "ts": "ISO-8601",
  "sessionId": "string",
  "modelId": "string",
  "taskId": "string|null",
  "usedItemIds": ["kb-entry-123"],
  "usageType": "decision|code|qc|validation|other"
}
```

## Guardrails

- Reject broad empty queries (for example: `"everything"`).
- Enforce per-turn token cap for KB retrieval.
- Never return full raw documents by default; return ranked snippets + source refs.
- Allow operator break-glass override; log as `kb.query.override`.

## Overwatch Live-Agent Role

- Overwatch may recommend retrieval but cannot silently inject KB by default.
- Recommended action format: "Run `kb.query` with this question now?"
- Any auto-injection mode must be explicitly enabled and audited.

## Rollout

1. **MVP**: awareness clause + `kb.query` tool + request/served audit events.
2. **Phase B**: add `kb.query.used` linkage and retrieval effectiveness metrics.
3. **Phase C**: optional operator-controlled exception path for emergency auto-injection.

