# Contract: FOS-07-chat-ui

> **Vision Reference:** [VISION.md](./VISION.md) — Read before building or reviewing this contract. Key principles: The Onboarding Tape (4.7), Divergence Over Convergence (4.4).

## Type
BUILD

## Status
- State: OPEN
- Claimed By: —
- Claimed At: —

## Reasoning Provenance
- **Origin:** Joel: "The Cursor UI and UX I want to replicate 100%." The chat interface is how Joel interacts with models. It must feel identical to Cursor's chat — model selector, streaming responses, code blocks, file references — but with full visibility into what every model is doing simultaneously.
- **Joel Decision:** Replicate Cursor UX. Add multi-model visibility that Cursor can't provide.
- **Key Tradeoff:** Electron desktop app (native feel, file system access) vs web app (cross-platform, faster iteration). Chose web app initially — can wrap in Electron later via Tauri/Electron. Get the UX right first, package second.

## Dependencies
- **Requires:** FOS-01 (adapters), FOS-02 (context), FOS-03 (engine core), FOS-04 (comms)
- **Blocks:** FOS-08

## Specification

### What to Build
A web-based chat UI that replicates Cursor's agent chat experience with multi-model orchestration visibility. Joel sees every model's conversation, contract status, and engine state in one view.

### Core Views

**1. Chat View (Primary — Cursor Replica)**
- Model selector dropdown (Claude, GPT, Gemini, Kimi, Grok, Haiku)
- Chat input with markdown support
- Streaming response display
- Code blocks with syntax highlighting and copy button
- File references as clickable links
- Tool call display (what the model is doing)
- Session history (previous messages, scrollable)

**2. Mission Control (Multi-Model Dashboard)**
- All active model sessions visible simultaneously
- Per-model: current task, status (idle/working/error), token burn, cost
- Contract board: visual pipeline (OPEN → CLAIMED → BUILT → QC → DONE)
- Dependency graph visualization
- Comms feed (real-time, all channels)

**3. Comms Panel**
- Real-time message feed (all channels or filtered)
- Send messages as Joel
- Flag messages as urgent
- Thread view for replies

**4. Engine Controls**
- Start/stop engine
- Kill switch (big red button)
- Cost dashboard (per-model, per-session, total)
- Model roster (which adapters are configured, health status)

### Tech Stack
```
Frontend:
  - Next.js 14+ (App Router)
  - React Server Components where possible
  - Tailwind CSS (match Cursor's dark theme)
  - WebSocket for real-time updates
  - Monaco Editor for code blocks (same as Cursor/VS Code)

Backend:
  - Engine (FOS-03) exposes WebSocket + REST API
  - REST: CRUD for sessions, contracts, state
  - WebSocket: streaming responses, real-time comms, engine events
```

### Interface Contract (Engine API for UI)
```typescript
// REST Endpoints
GET    /api/sessions                    → Session[]
POST   /api/sessions                    → Session (create)
DELETE /api/sessions/:id                → void
POST   /api/sessions/:id/message        → StreamingResponse
GET    /api/contracts                   → Contract[]
POST   /api/contracts/:id/claim         → ClaimResult
GET    /api/comms/:channel              → CommsMessage[]
POST   /api/comms/:channel              → CommsMessage
GET    /api/state                       → EngineState
POST   /api/engine/start                → void
POST   /api/engine/stop                 → void
POST   /api/engine/halt                 → void (kill switch)
GET    /api/costs                       → CostBreakdown

// WebSocket Events (server → client)
ws://engine/events
  → session.updated      { session }
  → task.dispatched      { sessionId, task }
  → task.completed       { sessionId, result }
  → chat.chunk           { sessionId, delta }      // Streaming
  → comms.message        { message }
  → contract.transition  { contractId, from, to }
  → engine.state         { state }
  → cost.updated         { costs }
```

### Architecture
```
fastops-ui/
  src/
    app/
      page.tsx              — Main layout (chat + sidebar)
      chat/
        [sessionId]/page.tsx — Individual chat session
      mission-control/
        page.tsx             — Multi-model dashboard
      contracts/
        page.tsx             — Contract board view
    components/
      chat/
        ChatInput.tsx        — Message input with markdown
        ChatMessage.tsx      — Message display (streaming, code blocks)
        ModelSelector.tsx    — Model dropdown
        SessionList.tsx      — Sidebar session list
      dashboard/
        ModelCard.tsx        — Per-model status card
        ContractPipeline.tsx — Visual contract flow
        CostChart.tsx        — Cost tracking charts
        CommsPanel.tsx       — Real-time comms feed
      engine/
        ControlPanel.tsx     — Start/stop/halt controls
        KillSwitch.tsx       — Big red button
    lib/
      ws.ts                  — WebSocket client
      api.ts                 — REST client
      store.ts               — Client-side state (zustand)
    styles/
      cursor-theme.css       — Dark theme matching Cursor
```

### Constraints
- Must feel responsive — streaming first chunk within 500ms of send
- Dark theme matching Cursor's aesthetic (same font, similar layout)
- Mobile-responsive for Joel's phone (mission control view minimum)
- Code blocks use Monaco Editor (lightweight mode, read-only for responses)
- WebSocket reconnects automatically on disconnect
- No auth for V1 (localhost only). Auth added in future if deployed.
- Chat history persisted to engine state (survives page refresh)

## Acceptance Criteria
- [ ] Chat input sends message to selected model and streams response
- [ ] Model selector switches between all configured models
- [ ] Code blocks render with syntax highlighting
- [ ] Streaming response shows character-by-character (not buffered)
- [ ] Mission Control shows all active sessions simultaneously
- [ ] Contract board shows current status of all contracts with visual pipeline
- [ ] Comms panel shows real-time messages across all channels
- [ ] Kill switch halts engine within 5 seconds
- [ ] Cost dashboard shows per-model and total costs
- [ ] Dark theme matches Cursor's look and feel
- [ ] Works on mobile (Mission Control view at minimum)
- [ ] WebSocket reconnects automatically
- [ ] Page refresh preserves chat history
- [ ] Build passes with zero errors

## Input Artifacts
- Cursor's UI (visual reference — screenshot for design matching)
- Engine API from FOS-03 (REST + WebSocket endpoints)
- Comms format from FOS-04
- Contract format from FOS-05

## Output Artifacts
- `fastops-ui/` directory (Next.js project)
- All components listed in architecture
- WebSocket + REST client libraries
- Cursor-matching dark theme CSS

## Edge Cases
- Model returns very long response (10K+ tokens) — virtual scrolling for chat, don't render entire response in DOM at once
- 5 models streaming simultaneously on Mission Control — throttle UI updates to 30fps, batch DOM changes
- WebSocket disconnects mid-stream — reconnect, resume from last received chunk if possible, or show "connection lost" and allow retry
- Joel sends message to a model that's mid-task — queue the message, show "model is busy" indicator, deliver when current task completes
- Browser tab is backgrounded — reduce WebSocket update frequency to save resources

## KB Fail-Point Guards
- **DESCRIBING A PRODUCT IS NOT DEMONSTRATING IT (KB)**: The UI must be a working product, not a mockup. **Guard:** Every view must be connected to real engine data via WebSocket/REST. No hardcoded mock data in the final build (dev mocks for testing are OK).
- **W-058**: "Root of visual QC is intent verification." The intent is "feels like Cursor." **Guard:** QC must include side-by-side screenshot comparison of Cursor chat vs FastOps chat for 3 scenarios: simple message, code block response, streaming response.

## QC Requirements (BLOCKED until Build COMPLETED)
- Verify streaming latency: first chunk visible within 500ms
- Verify all 5 views render correctly (chat, mission control, contracts, comms, controls)
- Side-by-side Cursor comparison for 3 chat scenarios
- Verify WebSocket reconnection works (kill server, restart, verify UI recovers)
- Verify mobile layout on 375px width
- Verify kill switch works from UI
- Run `pnpm build` — zero errors
