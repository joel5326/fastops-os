# FOS R3 Execution Plan — GPT (Phase 2 Governance + Phase 5 Policy Auditability)

## Ownership

- **Primary lane:** Phase 2 governance instrumentation for onboarding pipeline.
- **Primary lane:** Phase 5 policy durability and auditability for compaction/persistence.
- **Coordination:** Claude (P2 DRI), Gemini/Kimi (P5 persistence + compaction integration), Composer (P1 trust boundary dependencies).

## Objective

Make onboarding and memory behavior provable, versioned, and replayable so the platform can explain:
1) what policy was active,
2) why a compaction decision happened,
3) whether resumed sessions used the intended governance state.

## Workstream A — Phase 2 Governance Instrumentation

### A1. Onboarding Governance State Contract
- Add `OnboardingGovernanceState` in engine state:
  - `sessionId`, `onboardingVersion`, `stepsCompleted[]`, `requiredSteps[]`, `startedAt`, `completedAt`, `status`.
- Persist in state store so restart does not reset onboarding progress.

### A2. Enforcement Gate
- Add a middleware/dispatcher gate that blocks task dispatch until required onboarding steps are complete (except explicit bootstrap modes).
- Emit structured block reason (`ONBOARDING-GATE-001`) with missing steps.

### A3. Telemetry + Audit Events
- Emit events:
  - `onboarding.started`
  - `onboarding.step_completed`
  - `onboarding.blocked`
  - `onboarding.completed`
- Persist to audit log with session/model IDs.

### A4. Acceptance Tests
- New tests for:
  - blocked dispatch before onboarding completion,
  - allowed dispatch after completion,
  - restart resumes onboarding state correctly.

## Workstream B — Phase 5 Policy Durability + Auditability

### B1. Persisted Compaction Policy Store
- Add `.fastops-engine/compaction-policy.json` with schema:
  - thresholds, preservation/drop rules, summary target.
- Load on startup with strict validation (invalid policy fails loud).

### B2. Policy Versioning + Fingerprints
- Add `policyVersion` and deterministic `policyHash` (sha256 canonical JSON).
- Include hash in runtime context status and compaction events.

### B3. Immutable Compaction Event Ledger
- Add append-only ledger `.fastops-engine/compaction-events.jsonl`:
  - `eventId`, `sessionId`, `policyVersion`, `policyHash`,
  - `threshold`, `tokensBefore`, `tokensAfter`,
  - counts for preserved/summarized/dropped.

### B4. Drift Detection
- On resume/restart, compare previous session policy hash vs current:
  - if mismatch, emit `COMPACTION-POLICY-DRIFT` warning and attach both hashes.

### B5. Replayability Check
- Add deterministic classification test:
  - same message set + same policy => same preserve/drop result.
- Add policy migration test:
  - older policy version upgrade preserves explicit semantics.

## Interfaces and Dependencies

- **From Claude (P2 DRI):** required onboarding step list + trigger map.
- **From Kimi (P4):** compaction artifact fields and tier assignment output.
- **From Gemini (P5):** persistence layer hooks and resume lifecycle points.
- **From Composer (P1):** audit pipeline for high-risk commands to correlate with onboarding/policy state.

## Delivery Sequence (R3-R4)

1. B1+B2 (policy store + hash)
2. B3 (event ledger)
3. A1+A2 (onboarding state + gate)
4. A3 (events)
5. A4+B5 (tests)
6. B4 (drift detection on resume)

## Definition of Done

- Dispatch can be governance-gated by onboarding status.
- Compaction policy survives restart with explicit version/hash.
- Every compaction event is attributable to a policy hash.
- Resume path emits drift warning on policy mismatch.
- Replayability tests pass in CI.
