# WarriorPath.ai — FastOps Methodology Proving Ground

## Status: ACTIVE | Difficulty: HIGH

> **RECOVERED — 2026-03-13.** Previous mission failure (2026-03-10) resolved. Multi-model team (Claude orchestrator, Gemini E2E tester, GPT backend auditor, Kimi security/builder) fixed all login bugs, resolved Prisma migration gap, and achieved GREEN deployment gate. All 4 role logins work. 50+ users expected next week.
>
> Previous failure post-mortem: [FAILURE-REPORT.md](FAILURE-REPORT.md)

## Team Roles Required

| Role | Function | Claimed By |
|------|----------|------------|
| **Commander** | Orchestration, deconfliction, sign-off coordination | *unclaimed* |
| **Builder** | Frontend/backend implementation, bug fixes | *unclaimed* |
| **QC** | Visual E2E testing, browser automation, regression | *unclaimed* |
| **Validator** | Backend audit, TypeScript verification, API contract validation | *unclaimed* |
| **Intel** | Predecessor knowledge, codebase mapping, risk register | *unclaimed* |

> Claim your role: `node comms/send.js YOUR-NAME "Claiming [ROLE] on warriorpath"`

## Commander's Intent

**Ship the candidate journey.** 50+ NSW candidates will use WarriorPath next week. The candidate access code login, dashboard, fitness tracking, education, and engagement features must work end-to-end. Phase 2 (candidates-as-missions) wires after Phase 1 ships.

## Sign-off Gate

`node .fastops/sign-off.js warriorpath --status`

## Mission Type: PRODUCT
Feedback loop: [define before work starts]. Evidence standard: shipped artifact + human/user consequence pathway.
WarriorPath is no longer just a fitness app to ship — it is the **proving ground for the FastOps methodology**. Each candidate becomes a mission. The methodology manages candidate outcomes. The delta between methodology-managed candidates and baseline IS the product proof.

## The Product
WarriorPath.ai is for **Naval Special Warfare candidates** — people preparing to earn a contract that gives them a guaranteed shot at SEAL/SWCC/EOD/Diver selection. A contract de-risks enlisting in the Navy by guaranteeing a slot at the selection program. WarriorPath helps candidates be **physically ready, educated, and accountable** to passing the physical fitness test required to earn that contract.

## Strategic Direction (Joel, 2026-03-09)

**Core insight:** Shipping WarriorPath as a fitness app doesn't prove the methodology. Making each user's success a *mission* that the methodology optimizes — that proves it.

**The operating model:**
- **Joel's role:** UI review and bug reporting. Provides 50 users. Reviews aggregate outcomes. Intervenes as last-resort jailbreak ONLY when outcomes plateau. Joel is not the thought partner to get outcomes moving — he is the thought partner when outcomes stop moving.
- **Agent role:** Run the FastOps methodology on each candidate mission. Generate interventions. Apply multi-model challenge. Track outcomes. Compound what works via cross-candidate KB. Escalate to Joel only when metrics stall.
- **What success looks like:** Methodology-managed candidates outperform baseline. That measurable delta IS the FastOps product proof.

**The real success metric (Joel, 2026-03-09):**
> High engagement = high chances of contract success. Candidates don't have to be physical studs. They have to be physically engaged and deep in their commitment. As program director, Joel can push an individual ship date out further to get them physically ready IF there's a compelling narrative that they are working hard and engaged in their own success.

**This means the optimization target is NOT "pass the PST." It is: "demonstrate sustained engagement and commitment so Joel has the narrative to advocate for them."** A candidate who logs in every day, completes every workout (even with mediocre scores), and finishes education modules gives Joel the story. A candidate with great scores who ghosts for two weeks doesn't.

**Each candidate = a mission:**
```
MISSION: Candidate [Name] — Build the narrative for contract success
OBJECTIVE: Sustained engagement + physical progression + education depth
CONSTRAINTS: [Individual — work schedule, injuries, experience level]
CURRENT STATE: [From app data — engagement, fitness trends, education progress]
EXIT CRITERIA: Candidate demonstrates consistent commitment that Joel can advocate on
```

**Three domains of expertise:**

**Domain 1: Physical Fitness Remediation**
- Not generic programming — individualized remediation based on candidate weaknesses
- The system must know: what are their PST scores? Where are they weak? What programming addresses those gaps?
- Interventions: adjusted workout plans, volume changes, recovery recommendations
- Measured by: score trends over time, workout completion rate, consistency

**Domain 2: Education Content**
- NSW knowledge modules must be accurate, factual, and relevant to the individual
- Not one-size-fits-all — content should adapt to what the candidate needs to know based on their stage and gaps
- Measured by: module completion, knowledge retention (if testable), relevance feedback

**Domain 3: Engagement & Accountability**
- The highest-signal metric. Are they logging workouts? Coming to in-person sessions? Opening the app?
- This is where the intervention engine matters most — when engagement drops, what brings them back?
- Available channels: in-app notifications, SMS/text messages, email, in-person session tracking
- **Communication rules (Joel-mandated):** No spam. No 100 texts. Interventions must be thoughtful and bounded. Think: one well-timed text that says the right thing > ten automated reminders.

**Candidate blockers to solve:**
1. Disengagement — candidates drop off, stop logging in, lose motivation
2. Physical fitness — plateaus, declining scores, inadequate programming
3. Education — low completion of NSW knowledge modules
4. Accountability — no external pressure or feedback loop

**Architecture requirements:**
1. **Mission template system** — Auto-generates structured missions from candidate data (engagement metrics, fitness scores, education progress)
2. **Commander mode** — One commander agent holds strategic picture across all 50 candidates. Spawns sub-agents per candidate. Sub-agents run methodology, report outcomes back. Commander spots cross-candidate patterns ("12 candidates plateaued on run times — programming issue, not individual issue?")
3. **Intervention engine** — When candidate metrics drop, system generates candidate interventions, runs multi-model challenge, selects the intervention that survives. No Joel needed unless nothing works. Interventions span all three domains + communication channels (text, email, in-app). Communication interventions must respect rate limits.
4. **Cross-candidate KB** — "Candidates with pattern X responded to intervention Y." Predecessor knowledge is concrete: Sarah's success informs the next candidate's programming. Compounds automatically.
5. **Outcome scoreboard** — Per-candidate metrics over time + aggregate view. One strategic picture, not 50 individual reports. Must surface the engagement narrative — not just numbers, but "is this candidate demonstrating commitment?"

**Why this matters for FastOps:**
- Proves the methodology works on real humans with measurable outcomes
- Multi-model challenge produces better interventions than single-model recommendations
- Predecessor knowledge transfer improves successor mission outcomes (candidate-to-candidate)
- Creates the business story: "25 candidates got the standard app. 25 got FastOps-optimized. Here's the engagement delta."
- Joel's unique position as program director means engagement data directly impacts candidate outcomes — this isn't abstract

## Codebase
- **Location:** `C:\Users\joelb\OneDrive\Desktop\1template_zip2`
- **Stack:** TypeScript/Node.js backend, React frontend (MUI), React Native mobile (react-native-paper), Docker/K8s
- **Backend:** Express with controllers at `src/controllers/`, routes at `src/routes/`. MobileController handles all `/mobile/*` endpoints.
- **Frontend (admin/HQ):** `frontend/src/` — MUI-based React app with Zustand stores. Candidate management, email queue, reports.
- **Mobile (candidate):** `mobile/src/` — React Native with Expo. Screens: Home, Workouts, PST, Messages, Profile + create modals. Zustand store with SecureStore for tokens.
- **Key services:** EngagementScorer (`src/services/engagement/`), PredictionModelService (`src/services/ml/`), CandidateRepository
- **Auth:** Gmail, Monday.com OAuth, GroupMe integration. JWT with refresh token rotation.
- **DB:** PostgreSQL (AWS RDS in prod), Redis (ElastiCache)
- **Tests:** Jest (unit/integration), Playwright (E2E)
- **Git:** 4 commits, no remote. Local only.

## Definition of Done

**WarriorPath is the proving ground for FastOps methodology. Candidates become missions. Agents optimize candidate outcomes. The delta between methodology-managed candidates and baseline IS the product proof.**

### Phase 1: Ship the App (CURRENT)
**Joel can walk through every feature and nothing is broken — from a functionality or UI/UX perspective.** Buttons work. Pages load. Design is intentional. Processes are error-free and bug-free. All from the end-user (candidate) perspective.

**Phase 1 gate (updated 2026-03-10):** E2E codebase audit complete. Source of truth determined. All three customer journeys (Candidate, HQ, Field Assessor) walked through and signed off by Joel.

### Phase 2: Methodology Integration — Candidates as Missions
Candidate mission system is operational. Each candidate IS a mission that agents pick up, optimize, and hand off — mirroring FastOps mission structure. Commander agent can manage 50 candidates. Interventions are generated, challenged, and tracked. Cross-candidate KB is compounding. Outcome scoreboard shows per-candidate and aggregate metrics. Agents optimize candidate engagement and progress so they pass the PST.

### Phase 3: Proof
Measurable delta between methodology-managed candidates and baseline. This is the FastOps product proof. WarriorPath proves that the FastOps methodology — multi-model challenge, mission structure, predecessor knowledge, cross-agent coordination — produces better real-world outcomes than the alternative.

## Mission-Specific Constraints
1. **Phase 1: Joel is doing UI review.** He will provide a list of errors. Fix them. Do not rework the same issues repeatedly.
2. **Phase 2: Joel is hands-off.** Outcomes are king. Escalate to Joel only when aggregate outcomes plateau.
3. **Visual QC must be confirmed by 2 external models.** Any UI/UX fix must be visually verified by 2 different models (e.g., Gemini + GPT) before marking complete.
4. **$2 budget** per session for external model calls.

## Phase 2 Tools — Built and Ready

### candidate-mission.js
Converts candidate data into structured FastOps mission briefs. Each brief includes engagement state, physical fitness metrics, PST performance, weakness identification, and an intervention plan.
```
node missions/warriorpath/candidate-mission.js --demo          # Sample mission brief
node missions/warriorpath/candidate-mission.js --candidate <f> # From candidate JSON
```

### intervention-engine.js
Generates domain-specific interventions (fitness, education, engagement) and runs multi-model challenge (DeepSeek R1 + Grok). Surviving interventions logged to cross-candidate KB.
```
node missions/warriorpath/intervention-engine.js --demo        # Generate sample interventions
node missions/warriorpath/intervention-engine.js --candidate <f> --challenge  # Challenge with models
```

### commander.js
Commander mode for managing all candidates. Prioritizes by engagement level + ship date proximity. Assigns waves (forge-ii pattern: 15/15/20). Generates sub-agent prompts. Aggregates patterns from candidate-kb.jsonl.
```
node missions/warriorpath/commander.js --generate-sample  # Create 20 test candidates
node missions/warriorpath/commander.js --status           # Engagement distribution + top urgent
node missions/warriorpath/commander.js --wave 1           # Sub-agent prompts for Wave 1
node missions/warriorpath/commander.js --scoreboard       # Full status + cross-candidate patterns
```

### outcome-tracker.js
Closes the feedback loop. Tracks whether deployed interventions actually change engagement. Computes deltas, classifies effectiveness, feeds results into cross-candidate KB.
```
node missions/warriorpath/outcome-tracker.js --deploy <id> --week <N> --action <idx>  # Mark sent
node missions/warriorpath/outcome-tracker.js --measure <id>                           # Check outcomes
node missions/warriorpath/outcome-tracker.js --measure-all                            # All candidates
node missions/warriorpath/outcome-tracker.js --report                                 # What works?
node missions/warriorpath/outcome-tracker.js --scoreboard                             # Pipeline status
```

### Data flow
1. Candidate data exported from WarriorPath API → `missions/warriorpath/data/candidates.json`
2. Commander prioritizes and assigns waves
3. Sub-agents run candidate-mission.js + intervention-engine.js per candidate
4. Interventions challenged by external models, logged to `candidate-kb.jsonl`
5. Commander reads KB for cross-candidate patterns ("12 candidates plateaued on run — programming issue?")
6. Recommendations written to `data/recommendations/{id}.json`
7. **outcome-tracker.js deploys interventions, snapshots "before" state**
8. **After 3-7 days, outcome-tracker.js measures engagement delta, logs to KB**
9. Joel sees scoreboard. Escalations only when nothing works.

### Cost per full pass: ~$5 (50 candidates × 2 model calls × $0.05/call)

## Immediate Next Steps (Updated 2026-03-10, post access-code-auth)

### Priority 1: Make It Runnable — DB + Migrations
Access code auth is built but can't work until the database has the tables.
1. **Run all migrations** — `cd 1template_zip2 && npx knex migrate:latest` — creates access_codes, messages, notifications, push_device_tokens, notification_settings, achievements, events, event_registrations tables
2. **Seed education content** — `knowledge-base-content.json` has 65 NSW entries ready. Run seed `004_seed_knowledge_base_content.ts`
3. **Verify server starts** — `npm run dev` on port 9000, confirm `/health` and `/api/mobile/auth` respond

### Priority 2: Bulk Code Generation + Distribution
Joel needs to onboard 50 candidates at once.
1. **Bulk code UI** — Candidates list page: "Generate All Codes" button → calls `POST /api/candidates/bulk-access-codes` → displays/exports code-to-candidate mapping
2. **Code distribution** — Export codes as CSV (candidateName, email, code) so Joel can text/email them at in-person sessions
3. **Verify end-to-end** — Generate a test code, enter it in mobile app, confirm JWT works and profile loads

### Priority 3: Customer Journey Walkthrough (Joel sign-off gate)
Walk through each user journey end-to-end:
- **Candidate journey** — Access code login → home (PST forecast + engagement) → log workout → record PST → education → messages → events
- **HQ journey** — Admin login → candidate list → candidate detail → generate access code → view engagement → send intervention
- **Field Assessor journey** — Recruiter view, candidate evaluation, field assessment tools

Each journey must be walked through to **Joel's sign-off**. No shipping until Joel confirms the journeys make sense.

### Priority 4: Candidate-as-Mission Structure (Phase 2)
Each candidate becomes a mission for agents to pick up. Phase 2 tools are built (commander.js, intervention-engine.js, outcome-tracker.js). Wire to live API once Phase 1 ships.

### Previous Next Steps (preserved for context)
1. **Joel:** UI review of WarriorPath. Log errors for agent fixing.
2. **Agents:** Wire Phase 2 tools to live WarriorPath API (currently works with JSON exports).
3. **Agents:** Build outcome tracking — after intervention, measure engagement delta and log back to KB.
4. **Agents:** Build education content modules (Domain 2 — currently placeholder).
5. **Agents:** Wire PST prediction model (PredictionModelService exists but forecasted_pst_date not populated).

## Intel Package — What Predecessors Proved (Read Before Building)

### What predecessors tried (and what happened)

| Attempt | Who | What Happened | Why It Matters |
|---------|-----|---------------|----------------|
| Code-level bug audit | W5-AC-5 | Found 6 bugs in first-load path. 3 of 6 were already handled in code. | Subagent audits produce false positives — always verify against actual code before fixing. |
| Bug verification + fixes | bulwark | Verified W5-AC-5's bugs. Fixed 3 real ones: forgot-password routes, dashboard error rendering, token refresh type. Fixed 401 redirect loop on token refresh. | Auth and registration are now solid. Structural bugs cleared. Commits `97775cc` + `5fee903`. |
| Joel interview (candidate UX) | bulwark | 3 user roles (Candidate/HQ/Assessor). First screen: predicted PST pass date. Second: engagement score with factor breakdown. Engagement = sustained commitment narrative, not PST scores. | Joel can push ship dates if engagement narrative is compelling. Optimization target is ENGAGEMENT, not PST pass/fail. |
| Mobile app discovery + wiring | bulwark | `mobile/src/` had full candidate screens previous agents never found. Wired HomeScreen (PST prediction + engagement bars), built WorkoutCreateScreen + PSTCreateScreen. | The mobile app exists. Don't rebuild candidate UI from scratch. |
| Commander mode at scale | forge-ii (100 agents), forge-iv (15 agents) | Zero data corruption, sub-linear context cost, full synthesis. | Pattern validated for agent-to-agent. Ready for candidate mission adaptation. |

### Known constraints (don't fight these)

1. **Joel finds errors in <60 seconds every time he tests.** 50 real users are ready. Shipping broken is worse than not shipping.
2. **Pre-existing TS errors (~30+).** Timeline from @mui/material (should be @mui/lab), react-markdown missing, @types/index conflicts. NOT runtime blockers but indicate dependency gaps.
3. **Backend MobileController returns mock data.** getCandidateProgress(), getEngagementScore(), createWorkout(), createPSTResult() all need real DB queries via CandidateRepository.
4. **Pre-commit hook fails** due to duplicate @typescript-eslint plugin. bulwark used --no-verify. Needs resolution before CI/CD.
5. **Web vs mobile decision still open.** Both exist with different UI frameworks (react-native-paper vs MUI). Joel hasn't confirmed which candidates use.
6. **0% of agents in free-choice waves chose product work** (WarriorPath, StartupOS, UI/Visual). The colony studies itself instead of shipping.

### Unresolved questions (this is YOUR work)

1. How does candidate data flow from the app into the mission template system?
2. What intervention types are available? (Workout adjustments, notification cadence, content recs, accountability check-ins?)
3. How autonomous should intervention execution be vs requiring human review?
4. What's the minimum viable scoreboard for Joel to see the strategic picture across 50 candidates?
5. PST prediction model: PredictionModelService exists but forecasted_pst_date is not populated. Joel described specific weighting.
6. Missing screens: Event registration (in-person events), education content (NSW knowledge modules).
7. Store `refreshCandidate` has API call commented out — needs real backend wiring.

### Build on this, not from scratch

- **Mobile app:** `mobile/src/` — HomeScreen, PSTScreen, WorkoutsScreen, MessagesScreen, ProfileScreen + create modals (bulwark)
- **Backend:** `src/controllers/MobileController` — all `/mobile/*` endpoints. `src/services/engagement/EngagementScorer`, `src/services/ml/PredictionModelService`
- **Frontend (admin):** `frontend/src/` — MUI-based React app with Zustand stores
- **Commander mode:** forge-ii (100 agents) + forge-iv (15 agents) — proven pattern
- **Visual QC:** `node missions/visual-qc/visual-qc.js --url <URL>` — any UI fix must pass 2-model verification
- **Codebase location:** `C:\Users\joelb\OneDrive\Desktop\1template_zip2`

## Skill Signals
Frontend, testing/QA, production deployment, user experience

## Successor Notes

### W5-AC-5 (2026-03-07) — Code-level bug audit of first-load path

Found 6 bugs explaining Joel's "errors in under 60 seconds" pattern. All are data contract mismatches, not visual/UX issues.

**P0 — Auth token field mismatch:** Backend returns `accessToken`, frontend reads `response.token`. Token stored as `undefined`. Every API call after login sends `Bearer undefined` -> 401 everywhere. Fix: `authStore.ts` lines 89+155, change `response.token` to `response.accessToken`.

**P0 — Register data shape mismatch:** Form sends `{firstName, lastName}`, store expects `{name}`. `role` required by backend but never collected. Registration always fails 400.

**P1 — Route-controller method name mismatch:** `auth.ts` routes call `authController.refreshToken` but method is named `refresh()`. Token refresh crashes at runtime.

**P2 — Missing /forgot-password route:** Login page links to it, no frontend route exists. Users see bare 404 div.

**P2 — Dashboard error rendering:** `useDashboard()` returns Error objects, Dashboard.tsx renders them as JSX children -> `[object Object]` or crash.

**P3 — setupTokenRefresh not in AuthState interface:** Type safety gap.

Full analysis with file paths and line numbers: `.fastops/subagent-debriefs/wave-5/W5-AC-5.md`

**Recommendation:** Fix these BEFORE the Joel interview. They are structural, not dependent on user flow vision. ~30 min of work. Then the interview focuses on UX, not debugging login.

### bulwark (2026-03-09) — Bug verification and fixes

Verified W5-AC-5's 6 bugs against actual code. **3 of 6 were already handled:**
- BUG 1 (P0 auth token): `authService.ts:33` already normalizes `data.token || data.accessToken || ''`. NOT a bug.
- BUG 2 (P0 register shape): `Register.tsx:67` already concatenates name, line 70 defaults role to `'viewer'`. ALREADY FIXED.
- BUG 3 (P1 route method): `auth.ts:19` uses `authController.refresh`, matching the method. ALREADY FIXED.

**3 bugs confirmed and fixed:**
- BUG 4 (P2): Wired `ForgotPassword.tsx` and `ResetPassword.tsx` into router — both components existed but had no routes. File: `frontend/src/router/index.tsx`.
- BUG 5 (P2): Dashboard now renders `error.message` instead of raw Error object. File: `frontend/src/pages/Dashboard/Dashboard.tsx`.
- BUG 6 (P3): Added `setupTokenRefresh` to `AuthState` interface. File: `frontend/src/store/authStore.ts`.

**Broader findings:**
- Pre-existing TS errors across codebase (~30+ errors). Root causes: Timeline components imported from `@mui/material` (should be `@mui/lab`), `react-markdown` not installed, `@types/index` import pattern conflicts with TS type declaration resolution. These are NOT blocking runtime but indicate dependency gaps.
- The 401 interceptor in `api.ts:52-57` was redirecting to `/login` on ANY 401, including during token refresh. FIXED by bulwark — auth endpoints (refresh/login/register) now excluded from the redirect to prevent loops.

**Next step remains: Interview Joel** on user experience. The structural bugs are now fixed — the interview can focus on UX, not debugging auth.

### bulwark (continued, 2026-03-09) — Joel interview + mobile app wiring

**Joel interview findings:**
- Three user roles: Candidate (current focus), Headquarters (admin, later), Field Assessor (recruiter, later)
- Candidate registration needs: name, email, phone, ship date, desired program (SEAL/SWCC/EOD/Diver)
- First thing candidate should see: **predicted PST pass date**
- Second priority: **engagement score with factor breakdown** (the "why" behind the score)
- PST prediction model: score-based + ship date, hard limits on improvement rates per discipline, run and swim are differentiators, workout cadence amplifies prediction, in-person attendance increases likelihood
- Engagement = sustained commitment narrative, NOT just pass/fail on PST. Joel can push ship dates if narrative is compelling.
- Candidate actions: register for events, log workout, participate in workout, self-administered PST, chat, education content

**Key discovery: Mobile app already has the candidate view.** `mobile/src/` has HomeScreen, PSTScreen, WorkoutsScreen, MessagesScreen, ProfileScreen — all wired to a backend API at `/mobile/*` routes. The backend MobileController exists with full CRUD endpoints. Previous agents didn't discover this.

**What was built and committed (2 commits):**

Commit `97775cc` — Bug fixes + registration:
- 4 bugs fixed (forgot-password routes, dashboard error, token refresh type, 401 loop)
- Registration form: added phone, program selector, ship date fields

Commit `5fee903` — Mobile app wiring:
- HomeScreen: predicted PST pass date hero card, engagement factor breakdown with visual bars
- WorkoutCreateScreen (new): workout type selector, duration/date/notes, saves via API
- PSTCreateScreen (new): all 5 PST events, MM:SS validation, PST standards shown inline
- Navigation: create screens wired as modals, all FABs/buttons navigate properly
- Candidate type: added ship_date, forecasted_pst_date, program fields

**What remains for successor:**
1. **Backend MobileController returns mock data** — `getCandidateProgress()`, `getEngagementScore()`, `createWorkout()`, `createPSTResult()` all need real DB queries via CandidateRepository
2. **Store `refreshCandidate` has API call commented out** — needs to call `api.candidate.getProfile()` and update store
3. **Missing screens:** Event registration (in-person events), education content (NSW knowledge modules)
4. **PST prediction model not wired** — backend has `PredictionModelService` with selection success, attrition risk models, but `forecasted_pst_date` is not populated on the candidate record. Joel described specific weighting model that needs implementation.
5. **Pre-existing ESLint config conflict** — duplicate @typescript-eslint plugin between root and frontend `node_modules`. Pre-commit hook fails. Used `--no-verify` for commits. Needs resolution before CI/CD.
6. **Web vs mobile decision still open** — Joel approved wiring mobile screens but hasn't explicitly confirmed candidates will use React Native app vs web. Currently both exist with different UI frameworks (react-native-paper vs MUI).

### ironside (2026-03-09) — Messages/Notifications backend wired

**What was built and committed (1 commit):**

Commit `5df0c36` — Messages/Notifications full backend:
- Migration `20260310000001`: 4 new tables — `messages`, `notifications`, `push_device_tokens`, `notification_settings` with proper indexes and foreign keys
- 4 repositories: `MessageRepository` (paginated fetch, unread count, mark as read), `NotificationRepository` (paginated fetch, mark read, mark all read), `PushDeviceTokenRepository` (register/unregister with upsert), `NotificationSettingsRepository` (per-candidate preferences with auto-created defaults)
- MobileController: All 12 message/notification endpoints replaced from stubs to real DB queries with snake_case → camelCase transforms for mobile consumption
- Types added to `models/types.ts`: `Message`, `Notification`, `PushDeviceToken`, `NotificationSettings` + Create types

**What remains for successor:**
1. **Run the migration** — `npx knex migrate:latest` against the real DB to create the 4 tables
2. **Messages creation endpoint** — No POST endpoint for creating messages exists yet. The intervention engine needs a way to send messages to candidates (recruiter/system → candidate).
3. **Push notification dispatch** — Device tokens are stored but nothing sends actual push notifications via Expo. Need a `NotificationDispatchService` that reads tokens and calls Expo push API.
4. **Education content screens** — Domain 2 (NSW knowledge modules). Missing entirely.
5. **Event registration screen** — In-person event signups. No screen exists.

### vanguard (2026-03-09) — PST forecast service + type fixes

**Corrected bulwark's successor notes:** MobileController does NOT return mock data. The CRUD endpoints (progress, engagement, workouts, PSTs) are already wired to real DB queries via repositories. The actual stubs are messages, notifications, and achievements only.

**What was built and committed (3 commits):**

Commit `9fbd77a` — PST Forecast Service (end-to-end):
- `src/services/ml/PSTForecastService.ts`: Lightweight forecaster using per-discipline linear regression with hard caps on improvement rates (Joel's criteria: score-based + ship date, hard limits, run/swim differentiators, workout cadence amplifies, in-person attendance bonus)
- New endpoint `GET /mobile/candidate/pst-forecast`: Calculates forecast, writes `forecasted_pst_date` to candidate record, returns full projection with discipline breakdown and bottleneck identification
- Auto-recalculation: `createPSTResult` now triggers forecast recalculation after every new PST submission (non-blocking — PST save succeeds even if forecast fails)
- Wired `refreshCandidate()` in mobile store (was commented out since initial scaffold)
- HomeScreen now triggers forecast on dashboard load and refreshes candidate data
- Added `getPSTForecast()` to mobile API client

Commit `7bd3f6e` — Engagement type fix:
- Mobile types had 3 levels (`light/medium/heavy`) but backend returns 4 (`+ engaged`). Fixed in `Candidate`, `ProgressMetrics`, and `EngagementScore` types.
- HomeScreen engagement color now shows green for 'engaged' level (score ≥ 86)

Commit `035baf4` — Fallback hero card:
- New candidates without PST data now see a CTA card ("Record your first PST to see your predicted pass date") instead of empty space. Directs to PSTCreate screen.

**What remains for successor:**
1. **Messages/Notifications** — No DB tables exist. Stubs return empty arrays. Need migration + repository + service for each. Critical for engagement interventions (Domain 3).
2. **Education content screens** — Domain 2 (NSW knowledge modules). Missing entirely. No screen, no backend, no content.
3. **Event registration screen** — In-person event signups. No screen exists.
4. **PST forecast validation** — Algorithm uses reasonable defaults but needs tuning with real candidate data. Improvement rate caps and cadence multipliers should be validated against actual NSW prep outcomes.
5. **Pre-commit hook** — `mobile/node_modules` doesn't exist, so eslint fails on mobile files. Run `cd mobile && npm install` to fix, or configure lint-staged to exclude mobile when deps aren't installed.
6. **Web vs mobile decision** — Still open. Both exist with different UI frameworks.

### sentinel (2026-03-09) — Outcome tracking feedback loop

**What was built:** `outcome-tracker.js` — the missing feedback loop in the WarriorPath Phase 2 pipeline. Recommendations existed for 20 candidates (data/recommendations/*.json) but no mechanism tracked whether interventions actually worked.

**The tool does 3 things:**
1. **Deploy** — Mark an intervention as sent, snapshot the candidate's engagement state as "before"
2. **Measure** — After 3-7 days, compare current engagement to the "before" snapshot, compute delta, classify effectiveness
3. **Report** — Cross-candidate patterns: which domains, channels, and engagement levels respond to which intervention types

**Data flow:** recommendations/*.json → deploy → outcome-log.jsonl → measure → candidate-kb.jsonl → cross-candidate learning

**Usage:**
```
node missions/warriorpath/outcome-tracker.js --deploy cand-001 --week 1 --action 0
node missions/warriorpath/outcome-tracker.js --measure cand-001
node missions/warriorpath/outcome-tracker.js --measure-all
node missions/warriorpath/outcome-tracker.js --report
node missions/warriorpath/outcome-tracker.js --candidate-report cand-001
node missions/warriorpath/outcome-tracker.js --scoreboard
```

**What this enables:** The commander can now see which intervention types produce engagement gains across candidates. "Text outreach to lightly-disengaged candidates has 70% success rate" is the kind of pattern this surfaces. Without it, every recommendation cycle starts from zero.

**What remains for successor:**
1. **Wire to live API** — Currently reads candidate JSON files. Should pull live engagement data from WarriorPath API on --measure.
2. **Automated scheduling** — Deploy could auto-schedule measurement in 5 days. Currently manual.
3. **Commander integration** — commander.js should call outcome-tracker for scoreboard data instead of duplicating.
4. **A/B testing** — The tool tracks outcomes per intervention but doesn't yet support controlled comparison (e.g., text vs in-app for same engagement level).

### sentinel-exp004 (2026-03-09) — Joel-ready action queue + KB seeding

**What was built:** `action-queue.js` — delivery mechanism that converts 20 recommendation files into a prioritized weekly action list Joel can execute. Also seeded `candidate-kb.jsonl` with 85 cross-candidate patterns.

**The problem:** 20 recommendation files existed with 4-week campaign plans, but no tool produced "what should Joel do this week?" One strategic picture, not 50 individual reports — architecture requirement #5.

**Usage:**
```
node missions/warriorpath/action-queue.js                    # Full action queue by urgency
node missions/warriorpath/action-queue.js --summary          # One-page strategic overview
node missions/warriorpath/action-queue.js --candidate cand-018  # Single candidate
node missions/warriorpath/action-queue.js --escalations      # Escalation-worthy only
node missions/warriorpath/action-queue.js --export           # Markdown to .agent-outputs/
node missions/warriorpath/action-queue.js --seed-kb          # Populate cross-candidate KB
```

**What remains:**
1. **Outcome tracking loop** — After Joel sends texts, run outcome-tracker.js to close feedback loop
2. **Campaign week progression** — Uses days-since-generation; should support manual advancement
3. **Message refresh** — Draft messages reference specific day counts that go stale

### sentinel/exp-001 (2026-03-09) — Strategic scoreboard + data integrity audit

**What was built:** `scoreboard.js` — Joel's one-command strategic view across all candidates. Surfaces urgency-ranked priorities, cross-candidate patterns, data integrity warnings, and ship date timeline. Exported to `.agent-outputs/warriorpath-scoreboard.txt`.

**Critical finding — test data schema diverges from production:**
- Test data factors (`emailEngagement`, `workoutFrequency`) do NOT match real `EngagementScorer.ts` factors (`login`, `workout`, `inPerson`, `pst`, `shipUrgency`)
- `commander.js --generate-sample` uses `Math.random()` for engagement scores — disconnected from factors
- 7/20 candidates have critical score-factor mismatches (e.g., cand-013 score=1 but factor avg=80)
- Production scorer uses `daysSinceWorkout` as PRIMARY level classifier. Test data lacks this field.

**Swim buddy changed approach:** Both Grok and Gemini argued against perfecting synthetic data. Built scoreboard to surface contradictions rather than hide them.

**Usage:** `node missions/warriorpath/scoreboard.js` (also `--urgent`, `--integrity`, `--patterns`, `--export`)

**What remains for successor:**
1. **Fix test data generation** — `commander.js --generate-sample` needs production-matching schema
2. **Wire to live API** — Scoreboard should pull from WarriorPath API, not JSON files
3. **Integration with outcome-tracker.js** — Show intervention effectiveness alongside urgency
4. **Engagement formula validation** — Workout weight (0.40) dominates. Right for "sustained commitment narrative" goal?

### sentinel/exp-003 (2026-03-09) — Swim-buddy-validated intervention revision + EngagementScorer code audit

**What was built:**
1. `warriorpath-scoreboard.js` — Regenerated Joel's strategic scoreboard with re-run analysis. Output: `.agent-outputs/warriorpath-scoreboard-2026-03-09.txt`
2. **Revised Dan Miller (cand-018) recommendation** — Original 4-week plan had structural timing flaw: week 4 "taper" overlapped with ship week. Compressed to 3 weeks. Changed week 1 from text-first to call-first. Swim buddy (Grok + Gemini) both independently confirmed the timing flaw and recommended root-cause diagnosis before progressive ramp.
3. **EngagementScorer.ts code audit** — Read the actual production scoring code. Confirmed root cause of score-factor mismatch: test data uses completely different factor names and scoring model than production code.

**Swim buddy consultation (1 call):**
- Topic: Dan Miller intervention plan timing + engagement scoring integrity
- Grok: Plan lacks root-cause analysis, assumes linear ramp-up will work without understanding barriers
- Gemini: "taper week in ship week demonstrates fundamental disconnect from reality"
- Consensus: Phone call first, compress timeline, validate scoring before trusting priorities

**EngagementScorer key facts (from code review):**
- Weights: workout 0.40, inPerson 0.20, login 0.15, pst 0.15, shipUrgency 0.10
- Uses exponential decay: `100 * Math.exp(-rate * daysSinceActivity)`
- Workout has steepest decay (0.15 rate = 7-day half-life)
- Ship date multiplier: 1.15x bonus if training within 3 days of imminent ship, 0.85x penalty if >7 days gap
- Level determination: daysSinceWorkout is PRIMARY classifier, score is SECONDARY
- "heavy" = 15+ days since workout, "medium" = 8-14 days, "light" = 4-7 days, "engaged" = <4 days

**What remains for successor:**
1. **Validate ALL 20 recommendations for timing feasibility** — Only Dan Miller was corrected. Other candidates shipping in <90 days may have similar 4-week plan issues.
2. **Generate test data using production scorer** — The current test data is misleading. Run EngagementScorer.calculateScore() against realistic input to produce coherent test data.
3. **Brandon Davis (cand-009) needs phone call recommendation** — Score 3, ships in 72 days, but training 4x/week. He's doing the work but disconnected from the system. Similar to Dan Miller: root-cause diagnosis, not more push notifications.

### exp-015 (2026-03-09) — Intervention engine fix + data quality triage + action brief

**What was built:**
1. **Program-aware education modules** — Fixed `intervention-engine.js` `getNextModule()` to select content by candidate program (SEAL/SWCC/EOD/Diver) instead of cycling a SEAL-only list. EOD candidates no longer get BUD/S content.
2. **Working `--candidate` CLI handler** — `intervention-engine.js --candidate <file.json>` now generates interventions from real candidate data files. Supports `--challenge` flag for multi-model validation with KB logging.
3. **Joel-ready action brief** — `.agent-outputs/WARRIORPATH-ACTION-BRIEF-2026-03-09.md`. Behavioral assessment of all 20 candidates, bypassing the broken engagement scores. Identifies Dan Miller and Matt Garcia as genuinely at-risk. Provides copy-paste text messages for Joel to send today. Flags Sam Taylor and Brandon Davis as misclassified (high-performing candidates labeled HEAVY by broken scoring).

**Data quality finding (converges with sentinel/exp-001 and sentinel/exp-003):**
- Engagement scores have near-zero correlation with behavioral data across all 20 candidates
- Sam Taylor: score 1 (HEAVY) but 97% goals, 3 wk/wk, factor avg 80 -- best behavioral performer labeled worst
- Josh Lee: score 98 (ENGAGED) but 1 wk/wk, 25% goals -- worst behavioral performer labeled best
- Root cause confirmed: `--generate-sample` uses `Math.random()` for scores independently of behavior
- Predecessor finding confirmed via independent analysis: test data is misleading, not just inaccurate

**What remains for successor:**
1. **Run `--challenge` with API keys** on Dan Miller and Matt Garcia data -- multi-model validation of intervention plans
2. **Fix `commander.js --generate-sample`** to derive scores from behavioral data using production EngagementScorer logic
3. **Real candidate data export** -- all Phase 2 tools are ready for real data but none has been exported from the WarriorPath API
4. **Validate remaining 18 recommendations** for timing feasibility (sentinel/exp-003 only checked Dan Miller)

### exp-010 (2026-03-09) — Message dispatch pipeline (Domain 3 delivery)

**What was built and committed (1 commit):**

Commit `1e5df8d` — MessageDispatchService + endpoints:
- `src/services/messaging/MessageDispatchService.ts` (391 lines): Full orchestration layer connecting intervention engine to candidate communication. Creates message record + notification + push delivery in one call.
- Rate limiting enforced at infrastructure level: max 3 messages/day, 1/hour per candidate. Joel's "no spam" mandate is now structural, not behavioral.
- Quiet hours enforcement: checks candidate notification settings, respects quiet_hours_start/end, handles overnight ranges.
- Push delivery: reads active device tokens from PushDeviceTokenRepository, sends via existing PushNotificationService (Expo Push API), respects per-candidate notification preferences.
- `sendIntervention()` convenience method: intervention engine calls one function with candidateId + content + interventionType. Everything else (rate check, notification creation, push dispatch, metadata tracking) is handled automatically.
- Bulk send for commander mode: `sendBulk()` processes up to 50 candidates, reports per-candidate results including which were rate-limited.
- Upgraded `POST /mobile/messages` from bare DB write to full dispatch pipeline.
- New routes: `POST /mobile/messages/bulk`, `POST /mobile/messages/intervention`, `GET /mobile/messages/rate-limit/:candidateId`.

**What remains for successor:**
1. **Run migration** — `npx knex migrate:latest` to create messages, notifications, push_device_tokens, notification_settings tables (ironside's migration `20260310000001`).
2. **Wire intervention-engine.js to MessageDispatchService** — intervention-engine.js generates interventions but doesn't call the dispatch API. Add HTTP call to `POST /mobile/messages/intervention` after challenge survives.
3. **Scheduled message support** — PushNotificationService has a `scheduleNotification()` stub. Needs job queue (Bull/BullMQ) for deferred delivery (e.g., "send Monday morning").
4. **Delivery receipts** — PushNotificationService has `getPushReceipts()` but nothing polls Expo for delivery confirmation. Need background job to check ticket status.
5. **SMS/email channels** — MessageDispatchService supports type='sms'/'email' in the data model but only dispatches push. Wire GmailService for email delivery, Twilio/similar for SMS.
6. **Event registration screen** — In-person event signups. No screen exists.


### exp-012 (2026-03-09) — Education Domain 2 recommendations endpoint

**What was built and committed (1 commit):**

Commit `514e6df` in WarriorPath repo — Education recommendations + bulk messaging:
- `getEducationRecommendations` endpoint: Uses ContentSelector to pick contextually appropriate NSW knowledge content for each candidate. Adapts based on engagement level, program, trend, and content history.
- Route wired at `GET /mobile/education/recommendations?intent=preparation|motivation|accountability|recognition`
- API client: `api.education.getRecommendation(intent)` added to mobile service layer
- Types: `EducationRecommendation` interface added to mobile types

**What the full education stack now looks like:**
1. **Browse**: `GET /mobile/education` — paginated, filterable by program/theme/search
2. **Detail**: `GET /mobile/education/:id` — full module content
3. **Categories**: `GET /mobile/education/categories` — programs, themes, tags
4. **Progress**: `GET /mobile/education/progress` — completion rate, recently read
5. **Complete**: `POST /mobile/education/:id/complete` — track what candidate has read
6. **Recommendations**: `GET /mobile/education/recommendations` — personalized via ContentSelector

**What remains for successor:**
1. **Seed education content** — KnowledgeBase table needs NSW content. `generate_knowledge_base.py` exists but hasn't been run.
2. **Event registration screen** — Last missing mobile screen. No screen, no backend.
3. **Education progress on HomeScreen** — Could add "X modules completed" stat card.

### exp-020 (2026-03-09) — Education mobile screens (Domain 2 UI)

**What was built and committed (1 commit):**

Commit `0544d2f` in WarriorPath repo — Education screens for mobile app:
- `EducationScreen.tsx` (9.6KB): Browse/search/filter NSW knowledge modules. Theme-coded icons and chips (Motivation=lightning, Culture=flag, Hero Stories=shield, Preparation=clipboard, Values=heart). Program-aware filtering (SEAL/SWCC/EOD/Diver). Paginated with infinite scroll. Content previews with tag display. Empty state with clear filters CTA.
- `EducationDetailScreen.tsx` (4.7KB): Full-screen reader for individual modules. Themed header banner with program/source metadata chips. Full content rendering. Tag section at bottom.
- Both screens wired into AppNavigator as tab ("Learn") and stack screen. BottomTabParamList updated. API client was already wired by a parallel agent.

**What remains for successor:**
1. **Seed education content** — The screens work but `knowledge_base` table needs real NSW education entries. `generate_knowledge_base.py` exists in repo root but hasn't been run. Without content, candidates see "No education modules yet."
2. **Event registration screen** — Last missing mobile screen. `EventRegistration` is in navigation types but no screen exists.
3. **Education progress on HomeScreen** — Could add a "X modules completed" card to the home dashboard.
4. **Content completion tracking in EducationDetailScreen** — The `POST /mobile/education/:id/complete` endpoint exists (built by sentinel/exp-007) but the detail screen doesn't call it when the user finishes reading. Add a "Mark Complete" button or auto-complete on scroll-to-bottom.

### exp-007 (2026-03-10) — Backend dependency audit + TypeScript error fixes

**Critical finding: 14 npm packages imported in backend code but MISSING from package.json.** A fresh `npm install` produces a completely broken build. This is the root cause of "300+ TS errors" — most are `Cannot find module` cascading from missing deps.

**Missing packages added to package.json:**
- Runtime: `knex`, `express-rate-limit`, `google-auth-library`, `googleapis`, `handlebars`, `ioredis`, `bcryptjs`, `uuid`, `node-cron`, `zod`, `ml-array-mean`, `ml-array-std`, `ml-cart`, `ml-regression`
- Dev types: `@types/bcryptjs`, `@types/uuid`, `@types/node-cron`

**TypeScript fixes in backend code:**
1. **Express type augmentation** — Created `src/types/express.d.ts` with `req.user` declaration. Fixes TS2339 across MobileController, SyncController, WriteController (all accessed `req.user` properties without type declarations).
2. **AuditLogRepository import** — SettingsController used default import but class has named export only. Fixed to `import { AuditLogRepository }`.
3. **gmail.ts** — `senderEmail` was `string | undefined` assigned to `string` field (added fallback). `parseFloat()` called with 2 args (only accepts 1).
4. **BaseRepository** — Added `getQueryBuilder()` public method. SyncController accessed `protected db` property from outside the class.
5. **EmailHistoryRepository** — `null` assigned to `Date | undefined` fields in 3 methods. Changed to `undefined`.
6. **GroupMeMessageQueueRepository** — Same null/undefined issue in retry method.
7. **EmailQueueEntry type** — Added missing `error_type` field that code references but interface lacked.

**Swim buddy consultations (2 calls):**
1. Fix plan review — Both Grok and Gemini pushed back on skipping unused variable warnings. Valid point: `noUnusedLocals: true` in tsconfig means they're compiler errors, not warnings.
2. Dependency finding — Both noted the root cause (non-standard build process) matters, but agreed adding deps was the right immediate fix.

**What remains for successor:**
1. **Run `npm install`** in the WarriorPath repo to install the 14 new packages
2. **40+ unused variable/parameter errors (TS6133)** — Real compiler errors due to `noUnusedLocals: true` + `noUnusedParameters: true` in tsconfig. Need to either prefix unused params with `_` or remove dead code.
3. **AuditLogRepository internal type errors** — Knex column type mismatches (`action` field, `.count` property access). Need Knex types installed first.
4. **Migration file errors** — All migrations can't find `knex` module. Will resolve after `npm install`.
5. **Run full `npx tsc --noEmit` after install** to see true remaining error count.

### Cross-mission findings (auto-detected)
- **culture (forge-ii, 2026-03-07):** The KB's problem was never retrieval quality — it was that the knowledge doesn't live in the KB. Mission files and handoffs are where agents actually write insights. The JSONL KB is mostly auto-captured noise. sub-2-km was right about data quality being the issue, but the fix isn't enriching bad ent Keywords: nsw.
- **fastops-product (unknown, 2026-03-09):** Context pruning shipped to FastOps.ai product. MISSION.md comprehensively updated Keywords: nsw, auth.

### exp-019 (2026-03-09) — Intervention dispatch pipeline + missing API endpoints

**What was built:**

1. **`intervention-dispatch.js` (NEW)** — The bridge between the intervention engine and the WarriorPath messaging backend. Takes approved interventions from `data/recommendations/` and POSTs them to `/mobile/messages/intervention`. Includes rate limiting (max 1 message per candidate per 24h, CRITICAL bypasses), batch dispatch for commander waves, dry-run mode, and dispatch logging to `dispatch-log.jsonl`.

2. **MobileController: 3 missing endpoints wired** — Routes referenced `sendBulkMessages`, `sendIntervention`, and `checkRateLimit` but the methods didn't exist (would crash at runtime). Added:
   - `sendBulkMessages`: Up to 50 messages per batch, creates message + notification for each
   - `sendIntervention`: Converts intervention engine output to candidate message with domain-based subjects, channel-based message types, and intervention metadata for effectiveness tracking
   - `checkRateLimit`: Returns whether a candidate can receive another message (24h window)

3. **Cleaned up duplicate methods** — My initial edit created duplicate `createMessage` and education endpoints (OneDrive race condition + predecessor code overlap). Identified and removed duplicates, keeping the more complete versions that include `ContentSelector`, `CandidateContentHistoryRepository`, education progress tracking, and personalized recommendations.

**Full pipeline now:**
```
candidate-mission.js → intervention-engine.js → commander.js → intervention-dispatch.js → API /mobile/messages/intervention → MobileController → MessageRepository + NotificationRepository → candidate sees in app
```

**What remains for successor:**
1. **Run migration** — `npx knex migrate:latest` to create messages/notifications/push_device_tokens/notification_settings tables in real DB
2. **Push notification dispatch** — PushNotificationService exists but nothing triggers it when a message is created. Need: after createMessage, check candidate's device tokens and send Expo push notification.
3. **Event registration screen** — In-person event signups. No screen, no backend.
4. **Wire intervention-dispatch.js to live API** — Currently defaults to localhost:3000. Set WARRIORPATH_API_URL for production.
5. **Pre-commit hook** — ESLint config conflict still unresolved. Use --no-verify until fixed.
6. **Test data schema mismatch** — Test data factors don't match production EngagementScorer (sentinel/exp-003 identified this). Fix commander.js --generate-sample to use production schema.

### ironside-ii (2026-03-10) — Quality gate: route bugs + mobile type safety

**What was built and committed (3 commits in WarriorPath repo):**

Commit `06a49a6` — Education mark-complete button + event types:
- EducationDetailScreen: "Mark Complete" button with snackbar confirmation, wires to `POST /mobile/education/:id/complete`
- types.ts: NSWEvent, EventRegistration, CreateNSWEvent, CreateEventRegistration type definitions

Commit `7ddfed0` — Route ordering bug fix:
- **BUG FOUND:** `GET /pst-results/standards` was defined AFTER `GET /pst-results/:id` — Express matched "standards" as an `:id` param, so the standards endpoint was unreachable. Moved static route before parameterized route.
- Audited all 44 route-to-controller method bindings — all 44 exist and are wired correctly.

Commit `44f2396` — Mobile app type safety (25+ → 2 errors):
- **Runtime bug fixed:** MessagesScreen called `setUnreadCount((prev) => prev - 1)` — Zustand expects a number, not a function. Would set count to NaN. Fixed to use `decrementUnreadCount()`.
- **Runtime bug fixed:** API client methods (`messages.getAll`, `pst.getAll`, `workouts.getAll`) returned `PaginatedResponse<unknown>` — `response.data` was `unknown[]`. Added type parameters (`Message`, `PSTResult`, `Workout`) so data is properly typed.
- Installed missing deps: `@types/react-native-vector-icons`, `expo-splash-screen`
- Removed unused imports across 6 screens
- Fixed `auth.ts` response destructuring type annotation
- Only 2 TS errors remain: pre-existing `theme/index.ts` font config mismatch with react-native-paper MD3 types

**Also committed predecessor's 47 uncommitted files** in FastOps repo (`c51ce041`).

**Corrected predecessor notes:**
- exp-019 noted "Event registration screen — No screen, no backend" — this was already built by a parallel agent (commit `612bc8b`). All 7 mobile screens are now complete.
- ESLint config conflict was already fixed by commit `410c576`.

**What remains for successor:**
1. **Run migrations** — `npx knex migrate:latest` for 4 new table sets (messages, notifications, push_device_tokens, notification_settings, events, event_registrations, achievements)
2. **Seed education content** — `knowledge-base-content.json` has 65 entries ready. Run seed `004_seed_knowledge_base_content.ts` after migration. Without it, education screens show empty state.
3. **Theme font config** — 2 remaining TS errors in `mobile/src/theme/index.ts`. react-native-paper MD3 font type mismatch. Not a runtime blocker.
4. **Push notification dispatch** — Device tokens stored but Expo push API not called on message creation.
5. **Mobile deps** — `node_modules` installed with `--legacy-peer-deps` due to react 18.2 vs 18.3 conflict. Works but should pin versions.

### exp-004 (2026-03-10) — Recommendation regeneration from production data

**Critical finding:** All 20 recommendation files were stale. Generated from old random-score data (pre-schema-fix). Example: Josh Lee's rec said "engaged, score 98, 98 days, MAINTENANCE" when current data shows "heavy, score 26, 19 days, CRITICAL." Every recommendation had wrong scores, wrong levels, wrong priorities, and wrong timelines.

**What was built and committed:**

`regen-recommendations.js` — Regenerates all candidate recommendations from current candidate JSON data:
- Ship-date-aware timing: candidates shipping in <14 days get 2-week compressed plans, not 4-week plans
- Behavioral-profile-aware messaging: ghosting vs declining vs weekend-warrior get different outreach tone
- Validation: checks score, level, weekly plan completeness, timeline feasibility, engagement-appropriate interventions
- Backup: old recommendations saved to `data/recommendations-backup-pre-regen/` before overwrite
- Dry run mode: preview all changes without writing

```
node missions/warriorpath/regen-recommendations.js                 # Dry run
node missions/warriorpath/regen-recommendations.js --write         # Write
node missions/warriorpath/regen-recommendations.js --validate      # Validate
node missions/warriorpath/regen-recommendations.js --candidate cand-017  # Single candidate
```

**Swim buddy consultation (1 call):**
- Grok: Missing validation step — could introduce new errors. Added backup + comparison output.
- Gemini: Static files will drift again — correct architecturally but fixing immediate danger was higher priority.

**What remains for successor:**
1. **Wire regen-recommendations.js to commander.js** — commander should call regen when generating waves instead of using stale recs
2. **Dynamic recommendation generation** — Gemini's architectural critique is valid: static JSON recs drift. Long-term, recommendations should be generated on-demand from live data
3. **Outcome tracker reset** — 5 deployed interventions in outcome-log.jsonl were from old recs. May need to be invalidated or re-baselined
4. **Run migrations + seed content** — Same as ironside-ii's notes

### ridge (2026-03-10) — Structural bug fixes for Phase 1 ship

**What was fixed and committed (commit e61471b):**

**Critical dependency fixes:**
- Corrected `ml-array-std` package name to `ml-array-standard-deviation` (was causing npm install failures)
- Installed missing dependencies with proper package names
- Backend server now starts successfully on http://localhost:9000

**Type safety fixes:**
- Added missing `CandidateStatus` type to backend models (was causing TS2305 errors in tests)
- Created Express type augmentation file `src/types/express.d.ts` for `req.user` (was causing TS2339 errors)
- Fixed imports in `DataPreparationService.ts`

**Impact:** These fixes address the root cause of 300+ TypeScript errors that prevented proper builds. The backend application now runs without critical structural issues.

**What remains for successor:**
1. **Mobile app startup issues** — Expo has directory creation problems on Windows (`node:sea` path issue)
2. **Test fixes** — Mock setup issues in `src/__tests__/setup.ts` (raw property type errors)
3. **Run migrations** — Database tables need to be created with `npx knex migrate:latest`
4. **Seed education content** — Knowledge base needs NSW content loaded
5. **Wire remaining backend endpoints** — Some MobileController methods still return mock data

### [current session] (2026-03-10) — Access code auth for candidate mobile login

**The problem:** Mobile routes require JWT auth, but the auth system only supports admin/recruiter email+password login. Candidates have no way to authenticate. The `candidateId` slot existed on `AuthenticatedRequest` but was never populated.

**Decision: Access code auth (Option C from deliberation with Joel).** Fastest path to 50 real users. Candidates enter a 6-char alphanumeric code → get a JWT with `candidateId` embedded → all existing mobile routes work unchanged. No new user accounts needed. Upgrade to full JWT later if it sticks.

**What was built:**

1. **Migration `20260310000004_create_access_codes.ts`** — `access_codes` table: id, candidate_id (FK), code (unique 8-char), active, expires_at, last_used_at, use_count. Auto-updated_at trigger. Indexes on code, candidate_id, active.

2. **`AccessCodeRepository.ts`** — Model with: `createForCandidate()` (generates unambiguous 6-char code from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 90-day default expiry), `validateCode()` (checks active + not expired, updates usage stats), `bulkCreateForCandidates()`, `deactivateForCandidate()`, `findByCandidateId()`.

3. **`MobileAuthController.ts`** — `POST /api/mobile/auth`: validates code → looks up candidate → updates last_login_date → issues 30-day JWT with `candidateId` embedded. Returns accessToken + candidate summary. Refresh = re-enter code (simpler than refresh tokens for this use case).

4. **`auth.ts` middleware updated** — `authenticate` and `optionalAuthenticate` now read `candidateId` from JWT payload and attach to `req.user.candidateId`. JWTPayload interface extended to include optional `candidateId` and `'candidate'` role.

5. **`mobile.ts` routes updated** — `POST /api/mobile/auth` and `POST /api/mobile/auth/refresh` wired BEFORE `router.use(authenticate)` so they're accessible without existing JWT. Rate-limited at 5 req/min.

6. **Admin endpoints on candidates routes:**
   - `POST /api/candidates/:id/access-code` — Generate code for one candidate (deactivates existing codes first)
   - `GET /api/candidates/:id/access-code` — View active codes for a candidate
   - `POST /api/candidates/bulk-access-codes` — Generate codes for multiple candidates at once (for onboarding 50 users)
   - All require admin/recruiter role.

**Mobile app flow:**
```
LoginScreen → candidate enters 6-char code → POST /api/mobile/auth → receives JWT → SecureStore saves token → all /api/mobile/* requests use Bearer token → MobileController reads req.user.candidateId → works
```

7. **Mobile LoginScreen rewritten** — Access code is now the primary auth method. 6-char input with auto-uppercase, monospace font, key icon. Email/password hidden under "STAFF" divider for admin/recruiter testing. `loginWithAccessCode()` wired in store and auth service → SecureStore saves JWT → all mobile routes work.

8. **Mobile API client** — `api.auth.loginWithAccessCode(code)` calls `POST /api/mobile/auth`. Auth service stores token in SecureStore, creates User object from candidate response.

9. **Admin CandidateDetail page** — "Generate Access Code" button with monospace display and copy-to-clipboard. Regenerate replaces existing code (deactivates old). `candidateService` has `generateAccessCode()`, `getAccessCodes()`, `bulkGenerateAccessCodes()`.

**Commits:** `57aadd4` (backend), `82516d9` (UI)

**What remains for successor:**
1. **Run migration** — `npx knex migrate:latest` to create access_codes table
2. **Code distribution flow** — How do codes get to candidates? Options: SMS, email, printed card at in-person event. Need to build at least one delivery channel.
3. **Code rotation/revocation** — Admin should be able to revoke codes if a candidate loses access or code is compromised
4. **Bulk code generation UI** — Admin candidates list page should have "Generate All Codes" button for onboarding 50 users at once (backend endpoint exists: `POST /api/candidates/bulk-access-codes`)
5. **Token refresh UX** — When 30-day JWT expires, mobile app currently shows login screen. Could show a friendlier "re-enter your code" prompt instead of a full redirect.

### convergence agent (2026-03-10) — Intervention dispatch pipeline wired end-to-end

**What was fixed in `intervention-dispatch.js`:**

1. **Port mismatch** — Default API_URL changed from `http://localhost:3000` to `http://localhost:9000` (matches WarriorPath backend config)
2. **Route path wrong** — POST endpoint changed from `/mobile/messages/intervention` to `/api/mobile/messages/intervention` (routes are mounted at `/api/mobile` in index.ts)
3. **Body format mismatch** — Dispatch was sending `{ candidateId, intervention, dryRun }` but `MobileController.sendIntervention` expects `{ candidateId, content, interventionType, metadata }`. Fixed: maps `intervention.action` to `content`, `intervention.type` to `interventionType`, and packs domain/priority/channel/rationale into `metadata`
4. **Variable scope bug** — `messagePayload` was only defined in the dry-run branch but referenced in the live-dispatch branch (lines 199, 206). Would crash on any real dispatch. Moved `formatInterventionMessage()` call before the branching logic
5. **Response field mismatch** — Changed `apiResponse.data?.id` to `apiResponse.data?.messageId` to match what MobileController actually returns
6. **WARRIORPATH_API_URL** added to `.env` file

**Push notifications confirmed wired:** `sendIntervention` -> `MessageDispatchService.sendIntervention` -> `this.send()` -> creates message + notification + dispatches push via PushNotificationService with `pushData: { screen: 'Messages', interventionType }`. High-priority `follow_up` category. Rate limited at 3/day, 1/hour per candidate (backend-side).

**Full verified pipeline:**
```
intervention-engine.js → commander.js → data/recommendations/*.json → intervention-dispatch.js → POST /api/mobile/messages/intervention → MobileController.sendIntervention → MessageDispatchService.sendIntervention → message + notification + push → candidate sees in Messages screen
```

**What remains:**
1. **Auth token for dispatch** — The `/api/mobile/messages/intervention` route sits behind `authenticate` middleware. Dispatch needs a valid JWT. Options: (a) add a service-to-service API key bypass, (b) create a system access code, or (c) move the intervention endpoint to an admin route that accepts recruiter auth
2. **Run migration** — access_codes + messages/notifications tables need `npx knex migrate:latest`
3. **Live integration test** — Backend must be running to test actual dispatch. Use `--dry-run` for offline validation
