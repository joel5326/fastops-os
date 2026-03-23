# FOS-P1 — Agent Workspace Tools (File / Shell / Search)

**Status:** In progress  
**Owner lane:** Phase 1 — hands without Cursor  
**Depends on:** FOS-03 Engine Core (dispatcher, tool executor), FOS-06 Governance (halt, audit)

## Purpose

Give agents **read / write / edit / search / shell** capabilities through the FastOps OS engine, with a **single canonical sandbox root** per engine instance so the platform can eventually replace IDE-hosted tools without inheriting Cursor’s compaction model.

## Non-goals (this phase)

- Chokidar-backed watch → follow-up (same sandbox rules apply).
- UI for tool traces → FOS-07.
- Custom compaction → Phase 4.

## Contract

### 1. Sandbox root

- Every `ToolContext` carries **`sandboxRoot`**: an absolute, resolved filesystem path.
- **Default:** same as engine `workingDirectory` (CLI / server `process.cwd()` at boot).
- **Future:** `sandboxRoot` may be a strict subtree (e.g. monorepo package) while `workingDirectory` is a session cwd inside it.

### 2. Path resolution

- All file tool paths and shell `cwd` are resolved with `resolveSandboxedPath()` (`src/engine/tools/path-policy.ts`).
- Relative paths resolve against `workingDirectory`; absolute paths are allowed **only** if they still lie under `sandboxRoot` after `path.resolve`.
- **Symlinks:** `path.resolve` does not follow symlinks; a symlink **inside** the tree pointing **outside** is still a known gap (see risks).

### 3. Tools covered

| Tool     | Sandboxed |
|----------|-----------|
| read_file | Yes |
| write_file | Yes |
| edit_file | Yes |
| glob | `cwd` only |
| grep | `searchPath` only |
| bash | `cwd` only |

### 4. Shell escape (explicit)

Restricting `cwd` does **not** prevent a model from running `type C:\Windows\...` or `cat /etc/passwd` in the command string. **bash is not a filesystem sandbox**; it is a **bounded subprocess** with timeout and buffer limits only.

**Mitigations (future slices):** allowlists / denylists, split “safe” vs “raw shell,” separate `run_terminal_cmd` tier, or container per session.

### 5. Audit & halt

- Tool execution already emits `tool.executed` on the engine event bus; governance middleware should log high-risk tools (bash) at **enterprise** tier.
- Existing **halt file** (`HaltCheckMiddleware`) applies to model calls; ensure tool loop respects halt between iterations (dispatcher already runs middleware).

## Acceptance tests

- `path-policy.test.ts`: traversal `..`, absolute escape.
- Existing engine tests: `ToolContext` includes `sandboxRoot`.

## References

- Implementation: `src/engine/tools/path-policy.ts`, `file-ops.ts`, `bash.ts`, `search-ops.ts`
- Wiring: `src/engine/core/dispatcher.ts` (passes `sandboxRoot`)
- Execution plan (Composer): [FOS-P1-EXECUTION-PLAN.md](./FOS-P1-EXECUTION-PLAN.md) — sandbox env, bash tiers, tool audit milestones
