# FOS-P1 Execution Plan — Trust Boundary + Bash Risk Tiers

**DRI:** Composer (trust boundary + policy + tests)  
**Partner:** Claude/lens (dispatcher integration, tool definitions, adapter UX)  
**Aligned with:** MEETING R2 consensus (Gemini summary 2026-03-22) — both sign Phase 1 before “done.”

**Comms baseline reviewed:** Unanimous split — Composer leads sandbox / path policy / bash risk / tests; Claude wires tool surface inside that boundary. P0 risks: **InMemoryCommsBus durability** (Phase 3/5 — not this doc, but blocks “platform”), **shell escape** (this plan).

---

## Current state (already shipped)

| Area | Location | Notes |
|------|-----------|--------|
| Path sandbox | `src/engine/tools/path-policy.ts` | `resolveSandboxedPath`, cross-root escape |
| Tool context | `ToolContext.sandboxRoot` | Same as cwd today |
| Gated tools | `file-ops.ts`, `bash.ts`, `search-ops.ts` | **cwd/path** only — **command string not restricted** |
| Tests | `path-policy.test.ts`, `core.test.ts` | 100+ total suite |
| Contract | `contracts/FOS-P1-agent-workspace-tools.md` | Shell escape called out |
| Chat audit | `middleware/builtin/audit-log.ts` | Logs **requests/responses**, not per-tool argv |

**Gap:** `bash` can still read arbitrary paths via command text; audit does not record **which** shell command ran.

---

## Objective

1. **Trust boundary:** Optional **`FASTOPS_SANDBOX_ROOT`** (or `FASTOPS_WORKSPACE_ROOT`) distinct from session cwd when needed (monorepo subpackages).  
2. **Bash risk tiers:** Classify each `bash` invocation → **safe | standard | elevated** (names TBD); **log** all; **block** or **require extra gate** for elevated in `enterprise` tier.  
3. **Audit:** Append-only **tool audit** line for every tool call (at minimum `bash`, ideally all tools).  
4. **Exit criterion:** Joel + Composer + Claude agree **Phase 1** is satisfied: *sandbox cannot be escaped via paths/cwd; bash abuse is visible and constrained in enterprise; tests cover tier + blocks.*

---

## Milestone A — Sandbox config (0.5–1 day)

1. Add `sandboxRoot?: string` to engine boot config (default `process.cwd()`).  
2. Env: `FASTOPS_SANDBOX_ROOT` overrides default when set (resolve to absolute).  
3. Dispatcher passes `sandboxRoot` from config (not hardcoded `workingDirectory` duplicate if we split later).  
4. Tests: engine boots with `FASTOPS_SANDBOX_ROOT` pointing at temp dir; path outside → error.

**Deliverable:** PR with config + tests; update `FOS-P1-agent-workspace-tools.md` §1.

---

## Milestone B — Bash risk classifier (1–2 days)

**Inputs:** `command` string, `cwd` (already sandboxed), `securityTier` from `FastOpsConfig`.

**Outputs:** `{ tier: 'safe' | 'standard' | 'elevated', reasonCodes: string[] }`

**Heuristics (v1, iterate in tests):**

- **Elevated (non-exhaustive):** `rm -rf`, `format`, `mkfs`, `dd `, `curl|wget` with write, `Invoke-WebRequest` to file, registry edits on Windows, `> ` redirect to sensitive paths, `sudo`, `chmod 777`, pipeline to `sh -c` with suspicious payload.  
- **Safe:** read-only probes inside sandbox, e.g. `git status`, `npm test`, `dir` / `ls` without destructive subcommands.  
- **Standard:** everything else (writes inside repo, builds).

**Implementation:** `src/engine/tools/bash-policy.ts` — pure functions, 100% unit-tested table-driven cases.

**Tool behavior:**

- `development`: log tier; never block (except path escape — already blocked).  
- `enterprise`: block **elevated** with clear error; optional Joel flag `FASTOPS_BASH_ALLOW_ELEVATED=1` for break-glass.

---

## Milestone C — Tool execution audit (1 day)

**Problem:** `audit-log.ts` does not see tool arguments.

**Options (pick one in implementation PR):**

1. **ToolExecutor hook:** After `execute()`, append JSONL to `.fastops-engine/audit/tool-YYYY-MM-DD.jsonl` with `{ ts, sessionId, modelId, tool, tier?, commandPreview?, exitError? }`.  
2. **Wrap `bash` handler only** in v1; extend to `read_file`/`write_file` in v2.

**Privacy:** Store **first 500 chars** of command + hash of full command; never log env values.

**Deliverable:** file on disk + test that bash invocation creates a line.

---

## Milestone D — Integration & sign-off (0.5 day)

1. Claude reviews: dispatcher / tool defs still match adapter expectations.  
2. Run full `npm test` + one manual `fastops chat` with bash in enterprise mode.  
3. Update `FOS-P1-agent-workspace-tools.md` §4–5 with tier table + env vars.

---

## Dependencies / sequencing

| Dependency | Owner |
|------------|--------|
| Middleware around **tool** calls (if we want halt to block mid-tool) | Claude — may need `ToolExecutor` callback or event emitted before `execSync` |
| Comms WAL | Gemini/Kimi/Phase 5 — **not** blocking Milestone A–C, but P0 for colony |

---

## Risks (explicit)

1. **False positives:** Elevated heuristics may block legit `git` or `docker` — tune allowlist file `.fastops/bash-allowpatterns.json` later.  
2. **False negatives:** Hostile obfuscation (`powershell -e base64`) — v1 does not claim perfection; enterprise should pair with **container** or **no bash** mode long-term.  
3. **Symlink escape** — still tracked in FOS-P1; optional follow-up `realpath` + same-root check.

---

## Next action (Composer)

Open **Milestone A** PR in `fastops-os`: config + `FASTOPS_SANDBOX_ROOT` + tests, then **Milestone B** `bash-policy.ts` + wire into `bash.ts`.

---

*Drafted from MEETING R2 consensus + FOS-P1 contract. Subject to Joel/Claude edits.*
