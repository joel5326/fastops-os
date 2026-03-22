# Contract: FOS-08-integration-migration

> **Vision Reference:** [VISION.md](./VISION.md) — Read before building or reviewing this contract. This is the proof run — it must demonstrate the full vision end-to-end.

## Type
BUILD

## Status
- State: OPEN
- Claimed By: —
- Claimed At: —

## Reasoning Provenance
- **Origin:** FastOps OS doesn't replace Cursor overnight. There's a migration period where both systems coexist. This contract handles: (1) wiring all FOS-01 through FOS-07 together, (2) migrating existing state/comms/KB, (3) running the first real multi-model task through the engine, (4) validating the full system end-to-end.
- **Joel Decision:** "We need to evolve to our own OS." Evolution, not revolution. The migration must be incremental — run FastOps OS alongside Cursor, prove it works, then cut over.
- **Key Tradeoff:** Big-bang migration (build everything, flip the switch) vs incremental (run both, migrate piece by piece). Chose incremental — too much risk in a full cutover.

## Dependencies
- **Requires:** FOS-01, FOS-02, FOS-03, FOS-04, FOS-05, FOS-06, FOS-07 (everything)
- **Blocks:** Nothing (final contract)

## Specification

### What to Build
The integration layer that wires all components together, migrates existing data, and validates the complete system with a real multi-model task.

### Phase 1: Wire Everything Together
```
engine/
  index.ts — Already exists from FOS-03, extend to wire:
    - Adapters (FOS-01) registered with Engine
    - Context Manager (FOS-02) attached to Engine
    - CommsBus (FOS-04) connected to Engine event bus
    - ContractEngine (FOS-05) connected to Engine
    - Middleware stack (FOS-06) wrapping all adapter calls
    - HTTP/WebSocket server (FOS-07 backend) exposing Engine API

  server.ts — Express/Fastify server
    - REST routes for all API endpoints
    - WebSocket upgrade for real-time events
    - Static file serving for UI (or proxy to Next.js dev server)

  cli.ts — CLI entry point
    - `fastops start` — Start engine + server
    - `fastops stop` — Graceful shutdown
    - `fastops halt` — Kill switch
    - `fastops status` — Show engine state
    - `fastops chat <model> "message"` — Quick chat from terminal
    - `fastops dispatch <contract> <model>` — Assign contract
    - `fastops comms send <channel> "message"` — Send comms
    - `fastops comms read [channel]` — Read comms
```

### Phase 2: Migrate Existing Data
```
Migration scripts:
  migrate/
    comms.ts          — Import comms/data/*.jsonl into CommsBus
    knowledge.ts      — Import .fastops/knowledge-base.jsonl into engine KB
    contracts.ts      — Import contracts/*/*.md into ContractEngine
    state.ts          — Import .work-cycle-state.json into EngineState
    prompts.ts        — Generate per-model prompt files from existing CLAUDE.md
```

### Phase 3: Validation — The Proof Run
Run a REAL multi-model task through the engine end-to-end:

**Test Scenario: "3-Model Contract Build"**
1. Load 3 simple test contracts (A depends on nothing, B depends on A, C depends on B)
2. Engine assigns Contract A to Claude
3. Claude builds, reports BUILT
4. Engine assigns QC to GPT (different model)
5. GPT reviews, reports QC_PASS
6. Engine assigns Validation to Gemini (different model)
7. Gemini validates, reports VALIDATION_PASS
8. Contract A → DONE
9. Engine detects Contract B is now ready (dependency met)
10. Repeat for B and C

**Success = all 3 contracts reach DONE with 3 different models touching each one.**

### Phase 4: Coexistence Mode
During migration, both systems run:
- Cursor agents continue working via CDP (old system)
- FastOps OS engine runs alongside, receiving the same comms
- JSONL export from FOS-04 feeds into old comms/ directory
- Old `node comms/send.js` writes to both old JSONL and new CommsBus
- Joel gradually moves work from Cursor to FastOps OS

### Architecture
```
engine/
  server.ts           — HTTP + WebSocket server
  cli.ts              — CLI entry point
  config.ts           — Engine configuration (API keys, limits, paths)
  migrate/            — Migration scripts
    comms.ts
    knowledge.ts
    contracts.ts
    state.ts
    prompts.ts

package.json          — Dependencies, scripts
tsconfig.json         — TypeScript config
.env.example          — Required environment variables
```

### Constraints
- Engine must start in under 5 seconds (fast boot)
- CLI must be installable globally: `npm install -g fastops` (or local `npx fastops`)
- Migration scripts are idempotent (safe to run multiple times)
- Coexistence mode must not corrupt either system's state
- Configuration via `.env` file + `fastops.config.json`
- Engine server runs on configurable port (default 3100)

## Acceptance Criteria
- [ ] `fastops start` boots engine, loads adapters, starts server
- [ ] `fastops status` shows engine state, active sessions, adapter health
- [ ] `fastops chat claude "Hello"` sends message and prints streaming response
- [ ] `fastops halt` triggers kill switch, all work stops
- [ ] Migration: comms history imports correctly (spot-check 10 messages)
- [ ] Migration: KB entries import correctly (spot-check 5 entries)
- [ ] Migration: contracts import and parse correctly
- [ ] **PROOF RUN: 3-model contract lifecycle completes end-to-end**
- [ ] UI (FOS-07) connects to server and shows real data
- [ ] Coexistence: old `node comms/send.js` message appears in both old JSONL and new CommsBus
- [ ] Engine recovers from crash (kill process, restart, verify state)
- [ ] Total boot-to-first-response under 10 seconds

## Input Artifacts
- All FOS-01 through FOS-07 output artifacts
- Existing comms data in `comms/data/`
- Existing KB in `.fastops/knowledge-base.jsonl`
- Existing contracts in `contracts/`
- Existing state in `.fastops/.work-cycle-state.json`

## Output Artifacts
- `engine/server.ts` — HTTP + WebSocket server
- `engine/cli.ts` — CLI tool
- `engine/config.ts` — Configuration loader
- `engine/migrate/` — All migration scripts
- `package.json` with all dependencies
- `.env.example` with required keys
- `fastops.config.json` example configuration
- **PROOF RUN EVIDENCE:** Terminal output or screenshot showing 3-contract lifecycle completing with 3 different models

## Edge Cases
- API key missing for one provider — engine starts with available adapters, logs warning for missing ones
- Migration finds corrupted JSONL line — skip and log, don't fail entire migration
- Proof run model returns an error — retry once, then mark contract as BLOCKED and report
- Server port already in use — detect and suggest alternative port
- Engine started twice — second instance detects PID lock and exits with clear message
- Old comms system and new system both writing to same JSONL — use file locking to prevent corruption

## KB Fail-Point Guards
- **Broadside's regret**: "Never ran the server." The PROOF RUN is the entire point of this contract. It is NOT done until 3 models complete a real contract lifecycle. **Guard:** Acceptance criteria explicitly requires proof run evidence (terminal output or screenshot).
- **"Assumed it worked" (predecessor warning)**: Previous agents built scripts and never wired them. **Guard:** Every FOS component must be imported and initialized in engine/index.ts. If a component isn't referenced in the boot sequence, it doesn't exist.
- **W-036**: "Contracts must encode the full toolchain." `.env.example` must list EVERY required environment variable. `package.json` must list EVERY dependency. **Guard:** Fresh `git clone` → `npm install` → `cp .env.example .env` → fill keys → `fastops start` must work on first try.

## QC Requirements (BLOCKED until Build COMPLETED)
- Verify fresh install works (clone, install, configure, start)
- Verify proof run completes with real API calls to 3 different providers
- Verify migration scripts are idempotent (run twice, verify no duplication)
- Verify coexistence mode doesn't corrupt old system's state
- Verify CLI help text is clear and complete
- Verify engine crash recovery works
- Run `tsc --noEmit` — zero type errors
- Run `pnpm build` on UI — zero errors
