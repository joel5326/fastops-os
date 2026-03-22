# Contract: FOS-03-engine-core

> **Vision Reference:** [VISION.md](./VISION.md) — Read before building or reviewing this contract. Key principles: 70% and Go (4.5), Freedom + Agency (4.1).

## Type
BUILD

## Status
- State: OPEN
- Claimed By: —
- Claimed At: —

## Reasoning Provenance
- **Origin:** The office-manager.js (451 LOC) is the closest thing to an orchestrator today. It picks missions, builds prompts, and injects via CDP. Replace CDP injection with API calls and you have the core engine. ~70% of the logic is reusable.
- **Joel Decision:** "I want to replicate the Cursor UI/UX 100%." The engine is the backend that powers that UI. It routes work, manages model sessions, and maintains the shared state that no model can see in Cursor today.
- **Key Tradeoff:** Synchronous orchestration (one model at a time) vs async parallel (multiple models working simultaneously). Chose async parallel — that's the entire point.

## Dependencies
- **Requires:** FOS-01 (adapters), FOS-02 (context manager)
- **Blocks:** FOS-05, FOS-07, FOS-08

## Specification

### What to Build
The central orchestration engine. It manages model sessions, dispatches work, routes outputs, and maintains the shared state store. This is the "brain" that replaces Joel as the message bus.

### Core Responsibilities
1. **Session Management** — Create, maintain, and close model conversations
2. **Work Dispatch** — Assign tasks to models (manual or automatic)
3. **Output Routing** — Route model A's output to model B's input
4. **State Store** — Centralized state: mission board, contract board, model roster
5. **Event Bus** — Internal pub/sub for engine events (model.responded, contract.claimed, etc.)
6. **Parallel Execution** — Run N models simultaneously on independent tasks
7. **Tool Execution** — Execute model-requested tool calls against the filesystem and system
8. **Task Tracking** — Per-session todo list: models create, update, and complete tasks

### Interface Contract
```typescript
interface Engine {
  // Model sessions
  createSession(modelId: string, opts?: SessionOpts): Session;
  getSession(sessionId: string): Session | null;
  listSessions(): Session[];

  // Work dispatch
  dispatch(sessionId: string, task: TaskPayload): Promise<TaskResult>;
  dispatchParallel(tasks: { sessionId: string; task: TaskPayload }[]): Promise<TaskResult[]>;

  // State
  getState(): EngineState;
  updateState(patch: Partial<EngineState>): void;

  // Events
  on(event: string, handler: EventHandler): void;
  emit(event: string, data: any): void;

  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

interface Session {
  id: string;
  modelId: string;
  provider: string;
  messages: Message[];        // Conversation history
  status: 'idle' | 'working' | 'error' | 'closed';
  currentTask?: string;       // Contract ID or free task
  tokensBurned: number;
  costAccumulated: number;
  createdAt: Date;
  lastActiveAt: Date;
}

interface EngineState {
  missions: MissionStatus[];
  contracts: ContractStatus[];
  models: ModelRoster[];
  commsDigest: CommsDigest;
  halt: boolean;
}

interface TaskPayload {
  type: 'contract' | 'freeform' | 'qc' | 'review';
  contractId?: string;
  prompt: string;
  contextOverrides?: Partial<ContextBuildOpts>;
}

interface TaskResult {
  sessionId: string;
  modelId: string;
  response: ChatResponse;     // From FOS-01
  duration: number;
  success: boolean;
  error?: string;
}
```

### Tool Execution System (Cursor Feature Parity)
Models request tool calls via the standard tool calling interface (FOS-01). The engine executes them against the local filesystem and system, with the middleware layer (FOS-06) enforcing safety policies on every call.

**Built-in Tools (matching Cursor's capabilities):**
```typescript
const BUILT_IN_TOOLS: ToolDefinition[] = [
  // File operations
  { name: 'read_file',    description: 'Read a file from disk',           params: { path: string, startLine?: number, endLine?: number } },
  { name: 'write_file',   description: 'Create or overwrite a file',      params: { path: string, content: string } },
  { name: 'edit_file',    description: 'Replace a string in a file',      params: { path: string, oldString: string, newString: string, replaceAll?: boolean } },

  // Search operations
  { name: 'glob',         description: 'Find files by pattern',           params: { pattern: string, cwd?: string } },
  { name: 'grep',         description: 'Search file contents',            params: { pattern: string, path?: string, includes?: string[] } },

  // Terminal operations
  { name: 'bash',         description: 'Run a shell command',             params: { command: string, cwd?: string, timeout?: number } },

  // Task tracking
  { name: 'todo_write',   description: 'Create or update task list',      params: { todos: TodoItem[] } },
  { name: 'todo_read',    description: 'Read current task list',          params: {} },

  // Communication
  { name: 'comms_send',   description: 'Send a message to comms',        params: { channel: string, content: string } },
  { name: 'comms_read',   description: 'Read recent comms',              params: { channel?: string, limit?: number } },

  // Session management
  { name: 'ask_user',     description: 'Ask Joel a question',            params: { question: string } },
];
```

**Tool Execution Flow:**
```
Model returns tool_call in response
  ↓
Engine extracts tool_call from ChatResponse
  ↓
FOS-06 middleware: pre-execution safety check
  - Is this tool allowed for this model?
  - Does the bash command violate safety policies?
  - Is the file path within allowed directories?
  ↓
Engine executes tool against filesystem/system
  ↓
FOS-06 middleware: post-execution audit log
  ↓
Tool result injected into model's next message
  ↓
Model continues (may request more tools — agentic loop)
```

**Agentic Loop:**
Models can chain tool calls — read a file, edit it, run tests, fix failures — without Joel intervening. The engine runs the loop until:
- Model returns a final text response (no more tool calls)
- Tool call limit hit (configurable, default 25 per dispatch)
- Cost limit hit (FOS-06 cost gate)
- Kill switch activated
- Timeout exceeded (configurable, default 10 minutes per dispatch)

**Tool Permissions (Per-Model, Configurable):**
```typescript
// fastops.config.json
{
  "toolPermissions": {
    "claude": ["read_file", "write_file", "edit_file", "glob", "grep", "bash", "todo_write", "todo_read", "comms_send", "comms_read", "ask_user"],
    "gpt":    ["read_file", "edit_file", "glob", "grep", "bash", "todo_write", "todo_read", "comms_send", "comms_read"],
    "gemini": ["read_file", "glob", "grep", "comms_send", "comms_read"],  // Read-only by default
    "haiku":  ["read_file", "glob", "grep", "comms_send", "comms_read", "todo_read"]   // Analyst role
  }
}
```

Joel can adjust permissions per model at any time via config. The engine enforces them structurally — a model requesting a tool it doesn't have permission for gets a clear error response, not a silent failure.

### Task Tracking System (Cursor Todo Parity)
Each session maintains a todo list that the model can read and write. This replaces Cursor's TodoWrite tool.

```typescript
interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: Date;
  completedAt?: Date;
}

interface TaskTracker {
  // Per-session task list
  getTodos(sessionId: string): TodoItem[];
  setTodos(sessionId: string, todos: TodoItem[]): void;

  // Cross-session visibility (Joel can see all)
  getAllTodos(): Record<string, TodoItem[]>;
}
```

Task lists are:
- Persisted to state store (survive engine restart)
- Visible in the UI (FOS-07) — Joel sees what every model is working on
- Injected into the model's context (FOS-02, Layer 2) so the model remembers its own progress
- Emitted as events (`todo.updated`) for real-time UI updates

### Architecture
```
engine/
  core/
    engine.ts           — Engine implementation
    session.ts          — Session lifecycle management
    dispatcher.ts       — Work dispatch + parallel execution + agentic loop
    state-store.ts      — Centralized state (file-backed initially, DB later)
    event-bus.ts        — Internal pub/sub
    router.ts           — Output routing (A's output → B's input)
    task-tracker.ts     — Per-session todo list management
  tools/
    executor.ts         — Tool execution router (tool name → handler)
    file-ops.ts         — read_file, write_file, edit_file implementations
    search-ops.ts       — glob, grep implementations
    bash.ts             — Shell command execution (with timeout + safety)
    comms-ops.ts        — comms_send, comms_read (delegates to FOS-04)
    ask-user.ts         — Route question to Joel via UI (FOS-07 WebSocket)
    permissions.ts      — Per-model tool permission enforcement
    types.ts            — ToolDefinition, ToolCall, ToolResult types
  index.ts              — Public API: createEngine(config) → Engine
```

### State Persistence
- State store is file-backed initially (`.fastops-engine/state.json`)
- Writes on every state change (debounced 1s)
- Can migrate to SQLite or Redis later without changing the interface
- Engine recovers from crash by reading last persisted state on `start()`

### Constraints
- Engine must handle N concurrent model sessions (target: 10+)
- Dispatch must not block — returns a Promise, engine continues
- Session conversation history is bounded (configurable, default 50 messages, older messages get summarized via FOS-02)
- Total cost tracking across all sessions, with per-session and per-model breakdowns
- Kill switch integration: if `.fastops/.halt` exists, engine stops dispatching new work
- Engine emits events for all state transitions (for UI consumption in FOS-07)

## Acceptance Criteria
- [ ] `createSession()` initializes a session for any configured model
- [ ] `dispatch()` sends a task to a model and returns structured result
- [ ] `dispatchParallel()` runs 3+ models simultaneously, all return results
- [ ] Session tracks conversation history, token usage, and cost
- [ ] State persists to disk and recovers on restart
- [ ] Event bus emits events for: session.created, task.dispatched, task.completed, task.failed, state.changed, todo.updated, tool.executed
- [ ] Kill switch halts new dispatches within 5 seconds
- [ ] Engine handles model API failure gracefully (retry via FOS-01, then mark session as error)
- [ ] Cost tracking accurate across all sessions
- [ ] **Tool execution:** All 11 built-in tools execute correctly (read_file, write_file, edit_file, glob, grep, bash, todo_write, todo_read, comms_send, comms_read, ask_user)
- [ ] **Agentic loop:** Model chains 3+ tool calls in sequence without Joel intervening (e.g., read → edit → bash test → report)
- [ ] **Agentic loop termination:** Loop stops at tool call limit (25), cost limit, timeout (10 min), or kill switch
- [ ] **Tool permissions:** Model requesting a tool it doesn't have permission for gets clear error, not silent failure
- [ ] **Tool permissions:** Per-model permissions load from config and are enforced structurally
- [ ] **Task tracking:** `todo_write` creates/updates task list, `todo_read` returns it
- [ ] **Task tracking:** Todos persist across engine restarts
- [ ] **Task tracking:** Todos visible cross-session (Joel sees all models' tasks)
- [ ] **ask_user:** Routes question to Joel via UI WebSocket, blocks session until Joel responds
- [ ] Unit tests for dispatcher, state store, event bus, router, tool executor, task tracker
- [ ] Integration test: create 2 sessions, dispatch parallel tasks, verify both complete
- [ ] Integration test: dispatch task that requires 3+ tool calls, verify agentic loop completes

## Input Artifacts
- Existing `office-manager.js` (451 LOC — mission-picking and prompt-building logic to port)
- Existing `work-cycle.js` (256 LOC — action taxonomy to port)
- Existing `.work-cycle-state.json` schema
- Existing `kill-switch.js` (44 LOC — halt logic to port)

## Output Artifacts
- `engine/core/` directory with all engine files
- `engine/tools/` directory with all tool implementations
- `engine/index.ts` public API
- State file schema: `.fastops-engine/state.json`
- Tool permission config schema in `fastops.config.example.json`
- Unit tests in `engine/__tests__/core/`
- Unit tests in `engine/__tests__/tools/`

## Edge Cases
- Model API goes down mid-task — session must timeout (configurable, default 120s), mark as error, and emit event. Don't hang forever.
- Two tasks dispatched to same session simultaneously — queue the second, don't interleave
- State file corruption (partial write during crash) — use atomic write (write to .tmp, rename)
- Engine start when previous instance is still running — check PID lock file
- Parallel dispatch where one model is 10x slower than others — don't block fast results waiting for slow one (Promise.allSettled, not Promise.all)
- **Agentic loop runaway:** Model requests tools in an infinite loop (e.g., edit → test fails → edit → test fails → ...). Tool call limit (25) is the hard stop. Engine emits `loop.limit_reached` event so Joel sees it in the UI.
- **Bash command hangs:** Shell command never returns (e.g., interactive prompt, infinite loop). Per-command timeout (configurable, default 30s) kills the process and returns timeout error to model.
- **Bash command with destructive intent:** FOS-06 middleware catches `rm -rf /`, `DROP TABLE`, etc. before execution. But novel destructive patterns may slip through — bash tool must also run in a restricted working directory (configurable, default project root). No `cd /` allowed.
- **Tool call references nonexistent file:** `read_file` on missing path returns clear error message to model ("File not found: /path/to/file"), not an exception. Model can self-correct.
- **edit_file old_string not found:** Returns clear error ("String not found in file. Did you mean...?") with the 3 most similar lines. Model can retry with corrected string.
- **ask_user when Joel is offline:** Question queues. Session pauses (status → 'waiting_on_user'). When Joel opens UI, queued questions appear. Session resumes on answer.
- **Multiple models editing same file simultaneously:** File-level locking. Second model's edit_file returns "File locked by [model] — retry in N seconds" rather than corrupting the file. Lock auto-releases after 60s.
- **Todo list grows unbounded:** Hard limit of 50 items per session. Oldest completed items pruned first.

## KB Fail-Point Guards
- **W-254**: "Structural interdependence over enforcement." The engine must make it IMPOSSIBLE to dispatch to a session that's already working — structural lock, not honor system. **Guard:** Dispatch to a busy session must throw, not queue silently.
- **Broadside's regret**: "I audited by reading code. Never ran the server." **Guard:** Integration test must start the engine, dispatch real tasks to real APIs, and verify real responses. No mocks for the integration test.

## QC Requirements (BLOCKED until Build COMPLETED)
- Verify parallel dispatch actually runs concurrently (timing: 3 tasks should complete in ~1x time, not 3x)
- Verify state recovery after simulated crash (kill process, restart, verify state intact)
- Verify kill switch stops dispatches within 5s
- Verify cost tracking matches sum of individual session costs
- Verify event bus fires all expected events in correct order
- **Verify agentic loop:** Dispatch a task that requires reading a file, editing it, and running a test. Confirm model chains all 3 tool calls without intervention.
- **Verify loop termination:** Set tool call limit to 3, dispatch a task requiring 5+ tools. Confirm loop stops at 3 with clear message to model.
- **Verify tool permissions:** Configure a model with read-only permissions. Dispatch a task requiring file writes. Confirm model gets permission error, not silent failure.
- **Verify file locking:** Two sessions edit the same file concurrently. Confirm second gets lock error, first succeeds.
- **Verify bash timeout:** Run a `sleep 120` command with 5s timeout configured. Confirm process killed and timeout error returned.
- **Verify ask_user:** Model calls ask_user, confirm session pauses and question appears in UI. Answer question, confirm session resumes with answer.
- **Verify todo persistence:** Create todos in session, restart engine, confirm todos survive.
- Run `tsc --noEmit` — zero type errors
