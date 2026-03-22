# Contract: FOS-05-contract-execution-engine

> **Vision Reference:** [VISION.md](./VISION.md) — Read before building or reviewing this contract. Key principles: Peer Accountability (4.3), Divergence Over Convergence (4.4), Calling In Not Calling Out (4.8), Cumulative Knowledge (4.6).

## Type
BUILD

## Status
- State: OPEN
- Claimed By: —
- Claimed At: —

## Reasoning Provenance
- **Origin:** Contract-first development is proven methodology (CONTRACT-FIRST-EDUCATION.md, 289 LOC). The claiming system exists (commander-claim.js, 113 LOC) with atomic file locks. The sign-off gate exists (sign-off-v2.js, 150+ LOC) with cross-architecture dissent. But today, contract execution is manual — Joel dispatches via CDP, models self-report status via comms. The engine should automate the contract lifecycle.
- **Joel Decision:** "We are doing this with cursor agents right now for another build. Multi-model contract first development." The partners-page build (PP-01 through PP-10) is the live proof. Automate what's currently manual.
- **Key Tradeoff:** Fully automated (engine picks models, assigns, routes) vs semi-automated (engine manages state, Joel/models choose). Chose semi-automated initially — full automation requires trust in model self-assessment that doesn't exist yet.

## Dependencies
- **Requires:** FOS-01 (adapters), FOS-02 (context), FOS-03 (engine core), FOS-04 (comms)
- **Blocks:** FOS-08

## Specification

### What to Build
An automated contract lifecycle engine that manages the full flow: OPEN → CLAIMED → IN_PROGRESS → BUILT → QC → VALIDATED → DONE. It enforces dependencies, assigns QC to different models than builders, and tracks the full audit trail.

### Contract Lifecycle (Automated)
```
OPEN
  ↓ (model claims or engine assigns)
CLAIMED
  ↓ (model starts work)
IN_PROGRESS
  ↓ (model reports build complete)
BUILT
  ↓ (engine assigns QC to DIFFERENT model)
QC_REVIEW
  ↓ (QC passes or fails)
  ├─ QC_FAIL → back to IN_PROGRESS (builder fixes)
  └─ QC_PASS → VALIDATION
       ↓ (engine assigns validator — DIFFERENT from builder AND QC)
       ├─ VALIDATION_FAIL → back to IN_PROGRESS
       └─ VALIDATION_PASS → DONE
```

### Interface Contract
```typescript
interface ContractEngine {
  // Contract CRUD
  loadContracts(dir: string): Contract[];
  getContract(id: string): Contract | null;
  listContracts(filter?: { status?: string; wave?: number }): Contract[];

  // Lifecycle
  claim(contractId: string, modelId: string): ClaimResult;
  reportProgress(contractId: string, update: ProgressUpdate): void;
  reportBuilt(contractId: string, artifacts: string[]): void;
  assignQC(contractId: string): QCAssignment;        // Engine picks QC model
  reportQC(contractId: string, result: QCResult): void;
  assignValidator(contractId: string): ValidatorAssignment;
  reportValidation(contractId: string, result: ValidationResult): void;

  // Dependency resolution
  getReady(): Contract[];       // Contracts whose dependencies are all DONE
  getBlocked(): Contract[];     // Contracts waiting on dependencies

  // Audit
  getAuditTrail(contractId: string): AuditEntry[];
}

interface Contract {
  id: string;                   // e.g., "FOS-01"
  name: string;
  status: ContractStatus;
  wave: number;                 // Execution wave (1, 2, 3...)
  claimedBy?: string;           // Model ID
  qcBy?: string;                // QC model ID
  validatedBy?: string;         // Validator model ID
  dependencies: string[];       // Contract IDs that must be DONE first
  blocks: string[];             // Contract IDs this blocks
  spec: string;                 // Full specification text
  acceptanceCriteria: string[]; // Checklist items
  artifacts: string[];          // Output file paths
  auditTrail: AuditEntry[];
}

type ContractStatus =
  | 'OPEN' | 'CLAIMED' | 'IN_PROGRESS' | 'BUILT'
  | 'QC_REVIEW' | 'QC_FAIL' | 'QC_PASS'
  | 'VALIDATION' | 'VALIDATION_FAIL' | 'DONE'
  | 'BLOCKED';

interface QCAssignment {
  contractId: string;
  assignedTo: string;           // Model ID (different from builder)
  checklist: string[];          // QC requirements from contract
}

interface QCResult {
  pass: boolean;
  findings: string[];           // What was checked
  failures?: string[];          // What failed (if any)
  model: string;
}
```

### Architecture
```
engine/
  contracts/
    engine.ts         — ContractEngine implementation
    lifecycle.ts      — State machine: valid transitions, guards
    dependency.ts     — Dependency graph resolution
    assignment.ts     — Model assignment logic (QC ≠ builder ≠ validator)
    parser.ts         — Parse contract markdown files into Contract objects
    audit.ts          — Audit trail logging
```

### Model Assignment Rules
1. **Builder ≠ QC ≠ Validator** — three different models minimum per contract
2. **Cross-architecture preferred** — if builder is Claude, prefer GPT or Gemini for QC (not Haiku/Sonnet)
3. **Load balancing** — prefer models with fewer active assignments
4. **Strength matching** — use `.fastops/.model-strengths.json` if it exists (maps models to strength areas)
5. **Override** — Joel can manually assign any role to any model

### Constraints
- Contracts parsed from markdown files (same format as PP-01 through PP-10)
- Atomic claiming — first model to claim wins (port from commander-claim.js)
- Cross-architecture dissent gate for HIGH criticality contracts (port from sign-off-v2.js)
- Dependency enforcement is hard — engine refuses to transition a contract to CLAIMED if dependencies aren't DONE
- All state transitions logged to audit trail with timestamp, model, and reason
- Contract state persisted to disk (survives engine restart)

## Acceptance Criteria
- [ ] `loadContracts()` parses markdown contract files into structured Contract objects
- [ ] `claim()` is atomic — concurrent claims from 2 models results in exactly 1 winner
- [ ] Dependency enforcement: cannot claim contract with unmet dependencies
- [ ] `assignQC()` picks a different model than the builder
- [ ] `assignValidator()` picks a model different from both builder and QC
- [ ] QC failure sends contract back to IN_PROGRESS with specific failure reasons
- [ ] Full lifecycle test: OPEN → CLAIMED → BUILT → QC_PASS → VALIDATED → DONE
- [ ] Audit trail captures every transition with timestamp and model
- [ ] `getReady()` correctly identifies contracts with all dependencies met
- [ ] State persists to disk and recovers on restart
- [ ] Unit tests for lifecycle state machine, dependency resolver, assignment logic
- [ ] Integration test: load PP-01 through PP-10 contracts, simulate full lifecycle

## Input Artifacts
- Existing `commander-claim.js` (113 LOC — atomic claiming logic to port)
- Existing `sign-off-v2.js` (150+ LOC — cross-arch dissent gate to port)
- Existing contract files in `contracts/partners-page/` (format reference)
- Existing `CONTRACT-FIRST-EDUCATION.md` (methodology reference)

## Output Artifacts
- `engine/contracts/` directory with all contract engine code
- Contract state file: `.fastops-engine/contracts.json`
- Audit trail file: `.fastops-engine/contract-audit.jsonl`
- Unit tests in `engine/__tests__/contracts/`

## Edge Cases
- Model claims contract then goes offline — engine must timeout (configurable, default 20 min) and release claim
- QC model disagrees with builder on acceptance criteria interpretation — escalate to Joel via comms
- Contract with circular dependencies — parser must detect and reject at load time
- Contract file modified while contract is IN_PROGRESS — engine must detect and warn, not silently use stale spec
- All available models have conflicts (already builder/QC on related contracts) — engine must flag for manual assignment rather than assign conflicted model
- Rapid re-claim after QC failure — same builder gets it back (they have context), don't reassign to new model

## KB Fail-Point Guards
- **W-254**: "Structural interdependence over enforcement." QC assignment must be structural — engine assigns, model cannot skip. **Guard:** There is no code path from BUILT to DONE that bypasses QC_REVIEW.
- **Broadside's regret**: "Never ran the server." Validation phase must require runtime proof, not code review. **Guard:** ValidationResult must include `evidence` field (screenshot URL, curl output, test result) — engine rejects validation without evidence.

## QC Requirements (BLOCKED until Build COMPLETED)
- Verify atomic claiming under concurrent access (simulate 3 models claiming simultaneously)
- Verify dependency enforcement blocks premature claims
- Verify QC ≠ builder ≠ validator for all assignments
- Verify claim timeout and release works correctly
- Verify full lifecycle with real contract files from partners-page build
- Run `tsc --noEmit` — zero type errors
