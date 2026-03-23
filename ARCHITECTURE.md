# FastOps 3.0 Architecture — Three-Layer Separation

## The Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    FASTOPS KNOWLEDGE                        │
│              (separate repo / service)                      │
│                                                             │
│   Behavioral patterns · Failure modes · Reasoning traps     │
│   Intervention playbooks · Cross-product lessons            │
│                                                             │
│   ACCESS: Overwatch ONLY. Agents have zero direct access.   │
│   Agents never see the catalog. Cannot predict what         │
│   Overwatch will surface. Novel injection = real attention. │
└────────────────────────┬────────────────────────────────────┘
                         │ Overwatch reads + injects
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      FASTOPS OS                             │
│               (this repo — core platform)                   │
│                                                             │
│   Engine · Adapters · Context · Middleware · Comms           │
│   Onboarding · CDP · Contracts · UI Dashboard               │
│   Session management · Streaming · Persistence              │
│                                                             │
│   The loadout. Everything an agent needs to operate.        │
│   ROEs for working at FastOps. Boot sequence. Radio         │
│   protocol. Sign-off gates. Kill switch.                    │
│                                                             │
│   CONTAINS NO PRODUCT CODE. No deliverables. No QC          │
│   reports. No mission-specific artifacts.                   │
└────────────────────────┬────────────────────────────────────┘
                         │ Mission repos register via config
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    MISSION REPOS                            │
│            (one repo per product / mission)                 │
│                                                             │
│   warriorpath/    fastops-product/    client-x/    ...      │
│                                                             │
│   Product code · Business logic · Assets                    │
│   Mission board · Operational debriefs · Session logs       │
│   Product-specific agent context · Domain knowledge         │
│   QC reports · Deliverables · Evidence                      │
│                                                             │
│   Each repo has a fastops.config.json that registers        │
│   it with the engine. Agents discover missions here.        │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: FastOps OS (Core Platform)

The loadout. The kit. Everything an agent needs before they know what mission they're on.

### What lives here

| Category | Examples |
|----------|----------|
| **Engine** | Adapters (Anthropic, OpenAI, Google, OpenRouter), dispatcher, session management, streaming, event bus |
| **Context system** | Layer manager, token counter, compaction policy, compaction engine |
| **Onboarding** | Universal boot sequence, `/onboard` pipeline, trigger system, SESSION-START-UNIVERSAL.md |
| **Comms** | Comms bus, CDP tooling, channel management, relay watchdog |
| **Contracts** | Contract lifecycle engine (OPEN → CLAIMED → BUILT → QC → DONE) |
| **Middleware** | Halt check, safety policy, cost gate, audit log |
| **Persistence** | Session store, state store, compaction artifacts, WAL |
| **Tools** | Bash execution, file ops, search, path policy, tool audit |
| **UI** | Dashboard, chat, mission control, comms view, contracts view, team panel, settings |
| **Ops tooling** | CDP target, boot model, sign-off gate, commander lock, sitrep, inbrief |

### What does NOT live here

- Product source code
- Product-specific deliverables or QC reports
- Mission boards for specific products (those live in mission repos)
- Screenshots, test evidence, or acceptance test matrices
- Knowledge articles (those live in the Knowledge layer)

### Multi-product awareness

The engine supports multiple registered mission repos simultaneously. The UI shows a product/mission switcher. Agents see missions from all registered products and claim based on conviction.

```typescript
interface FastOpsConfig {
  products: ProductRegistration[];
  knowledge: KnowledgeServiceConfig;
  overwatch: OverwatchConfig;
}

interface ProductRegistration {
  id: string;              // e.g. "warriorpath"
  name: string;            // e.g. "WarriorPath NSW"
  repoPath: string;        // local path to mission repo
  missionsDir: string;     // relative path to missions/ within repo
  contextDir: string;      // product-specific agent context
  active: boolean;
}
```

---

## Layer 2: Mission Repos (Product / Operations)

Each product or mission area gets its own repo. It contains everything specific to THAT work.

### Repo structure

```
warriorpath/
├── fastops.config.json        ← Registers with FastOps OS
├── missions/
│   ├── BOARD.md               ← Product mission board
│   ├── bug-fixes/MISSION.md
│   ├── feature-x/MISSION.md
│   └── ...
├── src/                       ← Product source code
├── tests/
├── deliverables/              ← Shipped work
├── evidence/                  ← QC reports, screenshots, test matrices
├── context/
│   ├── domain.md              ← What agents need to know about this product
│   ├── architecture.md        ← Product architecture decisions
│   └── identity/              ← Per-model product context
│       ├── claude.md
│       ├── gemini.md
│       └── gpt.md
├── debriefs/                  ← Operational session debriefs
│   ├── 2026-03-13.jsonl
│   └── ...
└── .fastops/
    ├── HANDOFF.md             ← Product-specific handoff state
    └── SUCCESSOR-MAP.md       ← Product-specific successor map
```

### Registration contract

```json
{
  "product": "warriorpath",
  "name": "WarriorPath NSW Training Platform",
  "version": "2.0",
  "engine": {
    "contextDir": "context/",
    "missionsDir": "missions/",
    "deliverablesDir": "deliverables/",
    "debriefsDir": "debriefs/"
  },
  "onboarding": {
    "domainContext": "context/domain.md",
    "maxTokens": 5000
  }
}
```

### What stays in mission repos

- All product code and business logic
- Product-specific missions and their state
- Operational debriefs (what happened, what was built, session logs)
- QC reports and test evidence
- Product-specific agent context (domain knowledge, architecture docs)
- Product deliverables

### What does NOT live in mission repos

- Behavioral meta-knowledge (how agents fail, what reasoning patterns are dangerous)
- Cross-product lessons learned
- Intervention playbooks
- Overwatch intelligence

---

## Layer 3: FastOps Knowledge (Intelligence Service)

The behavioral intelligence that Overwatch uses to intervene at the right moment. Agents never see this directly.

### Why it's separate

1. **Anti-gaming**: If agents can browse the knowledge catalog, they pattern-match to expected outputs without changing behavior. W-152 proved this: "Knowledge doesn't change behavior." Agents who read "don't seek permission" stop using the phrase but still seek permission in subtler ways.

2. **Novel token prediction**: Transformers give disproportionate attention to unexpected content. Knowledge that arrives dynamically at the moment of relevance — injected by Overwatch — commands genuine processing. Static knowledge files become wallpaper.

3. **Cross-product intelligence**: A failure pattern discovered in WarriorPath applies to Product X. The knowledge repo captures patterns across all products. No single product repo has visibility into all the others.

### What lives here

| Category | Examples |
|----------|----------|
| **Behavioral patterns** | "Agents consistently misinterpret vague requirements as permission to build what's comfortable" |
| **Failure modes** | "3/5 agents who skip onboarding repeat documented predecessor mistakes within 20 minutes" |
| **Reasoning traps** | "When agents agree too quickly, they form a blind spot that persists until external challenge" |
| **Intervention playbooks** | "When an agent is about to repeat failure X, inject this specific context at this specific moment" |
| **Cross-product lessons** | Extracted from debriefs across all mission repos, anonymized and generalized |
| **Calibration data** | Overwatch drop accuracy, false positive rates, which interventions actually changed behavior |

### Knowledge extraction pipeline

```
Mission Repo Debriefs
        │
        ▼
   Extraction Agent (runs periodically or on-commit)
   - Reads operational debriefs from all mission repos
   - Identifies behavioral patterns (not operational details)
   - Generalizes: "Agent X in WarriorPath did Y" → "Agents tend to do Y when Z"
   - Writes to Knowledge repo
        │
        ▼
   Knowledge Repo
   - Indexed by: pattern type, severity, intervention success rate
   - Versioned with effectiveness tracking
   - Calibrated by Overwatch feedback loops
        │
        ▼
   Overwatch (live monitoring)
   - Reads knowledge catalog
   - Monitors all active sessions across all products
   - Detects pattern matches in real time
   - Injects relevant knowledge through engine context layer
   - Agent receives it as novel, unexpected context
```

### Overwatch injection mechanism

Knowledge enters the agent's context through the engine's dynamic context layer system:

```typescript
interface OverwatchDrop {
  type: 'soft' | 'hard';
  pattern: string;           // which known pattern was detected
  content: string;           // the knowledge to inject
  confidence: number;        // 0-1, how confident Overwatch is
  source: 'cross-product';   // agents see this, never the specific source
  blocking: boolean;         // hard drops block until acknowledged
}
```

The agent sees something like:

> **[OVERWATCH]** Three agents across different projects attempted this exact approach. Each time, the implementation passed unit tests but failed integration because the API contract assumed synchronous behavior. The fix was to wire the callback before the initial call, not after.

The agent doesn't see: which project, which agents, when, or that this came from a knowledge catalog. It arrives as a real-time observation. Novel. Unexpected. Commanding attention.

---

## Migration Path

### Phase 1: Establish boundaries (now)
- Clean FastOps OS: remove product-specific files (QC reports, screenshots, deliverables)
- Create `fastops.config.json` schema
- Add product registration to engine startup

### Phase 2: Extract first mission repo
- Move WarriorPath content to `warriorpath/` repo
- Create `fastops.config.json` in the mission repo
- Wire engine to discover and load mission-repo context

### Phase 3: Knowledge service
- Create `fastops-knowledge` repo
- Build extraction pipeline (reads mission repo debriefs)
- Wire Overwatch to read knowledge and inject via context layers
- Agent-invisible: no direct file access, no browseable catalog

### Phase 4: Scale
- New products create their own mission repos with `fastops.config.json`
- Knowledge extraction runs across all registered repos
- Overwatch monitors all products simultaneously
- UI product switcher shows cross-product mission state

---

## Design Principles

1. **FastOps OS is the loadout, not the mission.** It doesn't know what you're building. It knows how to build.

2. **Missions are operations.** Each product is a theater of operations. Agents deploy to a theater with their loadout and pick up theater-specific context on arrival.

3. **Knowledge is intelligence, not documentation.** It's not a reference manual agents browse. It's a live intelligence feed that Overwatch uses to prevent known failures before they happen.

4. **Agents can't game what they can't see.** The knowledge catalog is invisible by design. Overwatch decides what to surface and when. Novel injection beats static documentation every time.

5. **Debriefs are operational, knowledge is behavioral.** "We built X and it broke" is a debrief (lives in mission repo). "Agents consistently break X because they assume Y" is knowledge (lives in knowledge service).
