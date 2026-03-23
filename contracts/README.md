# FastOps OS — Contract-First Build Scope

> **Read [VISION.md](./VISION.md) first.** It defines the philosophy, design principles, and success criteria that all 8 contracts serve.

## What This Is
8 contracts to build a standalone multi-model AI orchestration engine that replaces Cursor + CDP with direct API access. Joel gets full control over context injection, compaction, collaboration, and governance for every model — not just Claude.

## Why
- **Cursor limits:** Only Claude gets CLAUDE.md. Other models fly blind.
- **CDP is fragile:** Browser automation creates zombie processes, has no feedback loop, and can't pass structured data.
- **No cross-conversation visibility:** Each Cursor chat is isolated. Joel is the message bus.
- **Compaction is uncontrolled:** Instructions injected via chat get summarized away. Only CLAUDE.md survives.
- **Context blindness:** No model knows its own token usage, cost, or when compaction will hit.
- **Cost opacity:** No per-model, per-task cost tracking.
- **Security:** Cursor routes through its own infrastructure. No way to keep client data in a private cloud tenant. No enterprise security tier.

## Enterprise Security Tier
Every adapter supports dual-mode: **direct** (provider API) and **cloud-hosted** (Azure OpenAI, AWS Bedrock, Google Vertex AI). In enterprise mode, data never leaves the client's cloud tenant. Direct-only providers (Kimi, Grok) are structurally disabled — no override.

**Enterprise-safe roster:** Claude (Bedrock/Vertex), GPT (Azure OpenAI), Gemini (Vertex AI), Llama (Azure AI/Bedrock), Mistral (Azure AI) — 5 distinct architectures, all cloud-hosted.

**The pitch:** "5 AI architectures stress-test your decision. None of your data leaves your Azure tenant."

## What We Keep (~70% reusable, ~3200 LOC)
- Comms protocol (protocol-v2.js) → migrates to engine-native CommsBus
- Office manager logic (office-manager.js) → becomes engine dispatcher
- Work cycle taxonomy (work-cycle.js) → becomes action assignment engine
- Atomic claiming (commander-claim.js) → becomes contract claiming
- Cross-arch dissent gate (sign-off-v2.js) → becomes QC assignment
- Knowledge base (kb-query.js) → migrates to engine KB layer
- Constitution/safety policies (policy-enforcer.js) → becomes governance middleware
- Kill switch (kill-switch.js) → becomes engine halt

## What We Build New (~30%)
- Direct API adapters for 6+ providers
- Context manager with per-model system prompts
- Engine core with parallel dispatch
- Chat UI replicating Cursor's UX
- Migration and integration layer

## Dependency Graph / Wave Plan

```
Wave 1 (Foundation — no dependencies):
  FOS-01: Model Adapter Layer

Wave 2 (Context — depends on Wave 1):
  FOS-02: Context Manager

Wave 3 (Core — depends on Waves 1-2):
  FOS-03: Engine Core / Orchestrator
  FOS-06: Governance Middleware        ← parallel with FOS-03

Wave 4 (Features — depends on Wave 3):
  FOS-04: Comms Migration
  FOS-05: Contract Execution Engine    ← parallel with FOS-04
  FOS-07: Chat UI                      ← parallel with FOS-04/05

Wave 5 (Integration — depends on everything):
  FOS-08: Integration & Migration
```

## Contract Summary

| ID | Name | Wave | Depends On | Key Deliverable |
|----|------|------|-----------|-----------------|
| FOS-01 | Model Adapter Layer | 1 | — | Unified API client for Claude, GPT, Gemini, Kimi, Grok, OpenRouter |
| FOS-02 | Context Manager | 2 | FOS-01 | Per-model system prompts, layered context, compaction control |
| FOS-03 | Engine Core | 3 | FOS-01, FOS-02 | Central orchestrator: sessions, dispatch, state, events |
| FOS-04 | Comms Migration | 4 | FOS-03 | Push-based comms replacing file polling |
| FOS-05 | Contract Execution | 4 | FOS-01-04 | Automated contract lifecycle with cross-model QC |
| FOS-06 | Governance Middleware | 3 | FOS-01, FOS-03 | Safety policies, cost gates, audit logging |
| FOS-07 | Chat UI | 4 | FOS-01-04 | Cursor-replica web UI with multi-model dashboard |
| FOS-08 | Integration | 5 | All | Wire everything, migrate data, proof run |

## Platform tools (Phase 1 — agent hands)

| ID | Name | Depends On | Key deliverable |
|----|------|------------|-----------------|
| **FOS-P1** | [Agent workspace tools](./FOS-P1-agent-workspace-tools.md) | FOS-03, FOS-06 | Sandboxed file + shell + search; documented shell-escape risk |

## Proof of Done
FOS-08 includes a mandatory proof run: 3 contracts executed by 3 different models (builder → QC → validator), fully orchestrated by the engine, with real API calls. No mocks. No "I read the code." Runtime proof.

## Multi-Model Build Assignment (Recommended)
These contracts are model-agnostic — any model can build any contract. Recommended assignment based on model strengths:

| Contract | Recommended Builder | Recommended QC | Rationale |
|----------|-------------------|----------------|-----------|
| FOS-01 | Kimi | Claude | Kimi: deep builds, security. Claude: governance lens. |
| FOS-02 | Claude | GPT | Claude: context expertise. GPT: will challenge assumptions. |
| FOS-03 | Kimi | Gemini | Kimi: exceeds assignment. Gemini: catches what's broken. |
| FOS-04 | Claude | Haiku | Claude: owns comms protocol. Haiku: analyst lens. |
| FOS-05 | GPT | Kimi | GPT: problem framing. Kimi: security review. |
| FOS-06 | GPT | Claude | GPT: says NO. Claude: governance. |
| FOS-07 | Gemini | Claude | Gemini: visual. Claude: UX verification. |
| FOS-08 | Claude | All models | Integration requires all hands. |

## How to Start
1. Joel reviews contracts, adjusts scope/priorities
2. Post to comms: "FastOps OS build — contracts at contracts/fastops-os/"
3. Models claim Wave 1 (FOS-01)
4. Build begins
