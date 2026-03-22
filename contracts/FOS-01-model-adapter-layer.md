# Contract: FOS-01-model-adapter-layer

> **Vision Reference:** [VISION.md](./VISION.md) — Read before building or reviewing this contract.

## Type
BUILD

## Status
- State: OPEN
- Claimed By: —
- Claimed At: —

## Reasoning Provenance
- **Origin:** FastOps has zero direct API client code. All model interaction goes through CDP browser automation (cdp-broker.js, cdp-target-model.js, cursor-wake.js). CDP is fragile — zombie processes, no feedback loop, no structured responses. Direct API access is the foundational unlock for everything else.
- **Joel Decision:** "Building the FastOps OS gives me more control of the multi-model environment." This contract is Wave 1 — nothing else works without it.
- **Key Tradeoff:** Thin adapter (just API calls) vs rich adapter (streaming, tool use, structured output). Chose rich — streaming and structured output are table stakes for an orchestration engine.

## Dependencies
- **Requires:** None (Wave 1 — foundation)
- **Blocks:** FOS-02, FOS-03, FOS-04, FOS-05, FOS-06, FOS-07, FOS-08 (everything)

## Specification

### What to Build
A unified model adapter layer that provides a single interface for calling any supported LLM API. Each provider gets an adapter that normalizes request/response format.

### Supported Providers (Initial)
| Provider | Direct API | Cloud-Hosted (Enterprise) | Models |
|----------|-----------|--------------------------|--------|
| Anthropic | Messages API | **AWS Bedrock** / **Google Vertex AI** | Claude Opus, Sonnet, Haiku |
| OpenAI | Chat Completions | **Azure OpenAI Service** | GPT-4o, o1, o3 |
| Google | Generative Language API | **Google Vertex AI** | Gemini 2.5 Pro, Flash |
| Meta | — | **Azure AI** / **AWS Bedrock** | Llama 3.x (open source, fully self-hosted) |
| Mistral | Mistral API | **Azure AI** | Mistral Large, Medium |
| Moonshot | Chat API | ❌ None (dev/non-sensitive only) | Kimi / Moonshot |
| xAI | Chat API | ❌ None (dev/non-sensitive only) | Grok |
| OpenRouter | Unified API | ❌ None (dev/fallback only) | Any |

### Dual-Mode Architecture: Direct vs Cloud-Hosted
Every adapter supports two endpoint modes, selected via configuration:

**Direct Mode** — calls the provider's own API (api.anthropic.com, api.openai.com, etc.)
- For: development, personal use, non-sensitive tasks
- Pro: simplest setup, just needs an API key
- Con: data leaves your infrastructure, each provider has different data policies

**Cloud-Hosted Mode** — calls enterprise cloud endpoints (Azure OpenAI, AWS Bedrock, Vertex AI)
- For: enterprise clients, sensitive data, compliance-required environments
- Pro: data never leaves your cloud tenant, zero-training guarantees, single compliance framework
- Con: requires cloud account setup, slightly higher per-token cost

The adapter interface is identical in both modes. Code above the adapter layer doesn't know or care which mode is active. Configuration determines routing:

```typescript
// fastops.config.json
{
  "adapters": {
    "anthropic": {
      "mode": "cloud-hosted",           // "direct" | "cloud-hosted"
      "direct": {
        "apiKey": "${ANTHROPIC_API_KEY}"
      },
      "cloudHosted": {
        "provider": "bedrock",          // "bedrock" | "vertex"
        "region": "us-east-1",
        "credentials": "aws-profile"    // AWS profile or GCP service account
      }
    },
    "openai": {
      "mode": "cloud-hosted",
      "direct": {
        "apiKey": "${OPENAI_API_KEY}"
      },
      "cloudHosted": {
        "provider": "azure",
        "endpoint": "https://your-instance.openai.azure.com",
        "apiVersion": "2024-12-01-preview",
        "deploymentMap": {
          "gpt-4o": "your-gpt4o-deployment",
          "o3": "your-o3-deployment"
        }
      }
    }
  }
}
```

### Enterprise Security Tier
When all adapters run in cloud-hosted mode within a single cloud tenant:

```
┌─────────────────────────────────────────────────┐
│            Azure Private VNet / AWS VPC          │
│                                                  │
│  ┌──────────────────┐                            │
│  │  FastOps Engine   │                            │
│  │  (VM / Container) │                            │
│  └──┬───┬───┬───┬──┘                            │
│     │   │   │   │    Private Endpoints           │
│     ▼   ▼   ▼   ▼                                │
│  Azure OpenAI  Bedrock  Vertex AI  Azure AI      │
│  (GPT)         (Claude) (Gemini)   (Llama,       │
│                                     Mistral)     │
│                                                  │
│  ✅ Data never leaves tenant boundary             │
│  ✅ Zero-training guarantees (contractual)        │
│  ✅ Single compliance framework                   │
│  ✅ Full audit trail                              │
│  ✅ Data residency control (pick region)          │
└─────────────────────────────────────────────────┘
```

**Enterprise-safe model roster** (all available cloud-hosted):
- Claude (Bedrock / Vertex) — Anthropic architecture
- GPT-4o, o1, o3 (Azure OpenAI) — OpenAI architecture
- Gemini (Vertex AI) — Google architecture
- Llama (Azure AI / Bedrock) — Meta architecture, open source, fully self-hosted
- Mistral (Azure AI) — Mistral architecture

That's 5 distinct model architectures with genuinely different training data and reasoning approaches — enough for real multi-model collision. Models without cloud-hosted options (Kimi, Grok, DeepSeek) are available in direct mode for development and non-sensitive work only.

### Interface Contract
```typescript
interface ModelAdapter {
  // Core call — send messages, get response
  chat(request: ChatRequest): Promise<ChatResponse>;

  // Streaming variant
  chatStream(request: ChatRequest): AsyncIterable<ChatChunk>;

  // Provider info
  provider: string;
  models: string[];

  // Health check
  ping(): Promise<boolean>;
}

interface ChatRequest {
  model: string;
  systemPrompt: string;         // Per-model "CLAUDE.md equivalent"
  messages: Message[];
  tools?: ToolDefinition[];     // Function calling
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, any>; // Pass-through for provider-specific opts
}

interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { inputTokens: number; outputTokens: number; cost: number };
  model: string;
  provider: string;
  latencyMs: number;
  raw?: any;                    // Original provider response for debugging
}

interface ChatChunk {
  delta: string;
  toolCallDelta?: Partial<ToolCall>;
  done: boolean;
}
```

### Architecture
```
engine/
  adapters/
    base.ts           — Abstract ModelAdapter class (handles dual-mode routing)
    anthropic/
      direct.ts       — Claude via @anthropic-ai/sdk (api.anthropic.com)
      bedrock.ts      — Claude via @aws-sdk/client-bedrock-runtime
      vertex.ts       — Claude via @google-cloud/vertexai
      index.ts        — Picks direct/bedrock/vertex based on config
    openai/
      direct.ts       — GPT via openai SDK (api.openai.com)
      azure.ts        — GPT via openai SDK (azure endpoint override)
      index.ts        — Picks direct/azure based on config
    google/
      direct.ts       — Gemini via @google/generative-ai
      vertex.ts       — Gemini via @google-cloud/vertexai
      index.ts        — Picks direct/vertex based on config
    meta/
      bedrock.ts      — Llama via Bedrock (cloud-hosted only)
      azure.ts        — Llama via Azure AI
      index.ts
    mistral/
      direct.ts       — Mistral via REST
      azure.ts        — Mistral via Azure AI
      index.ts
    moonshot.ts       — Kimi via REST (direct mode only, no cloud option)
    xai.ts            — Grok via REST (direct mode only, no cloud option)
    openrouter.ts     — Fallback via REST (direct mode only)
    registry.ts       — Registry: getAdapter(provider) → ModelAdapter
  types.ts            — Shared types (ChatRequest, ChatResponse, etc.)
  credentials.ts      — Credential management (API keys, AWS profiles, GCP service accounts)
  config.ts           — Adapter configuration loader (fastops.config.json)
  security.ts         — Data classification: which adapters are allowed for sensitive data
```

### Constraints
- Each adapter must handle its own rate limiting and retry logic (exponential backoff, max 3 retries)
- Cost tracking must be per-call (use provider pricing tables, updated monthly). Cloud-hosted pricing differs from direct — track both.
- Credentials are mode-dependent:
  - **Direct mode:** API keys via env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
  - **Cloud-hosted mode:** Cloud credentials (`AWS_PROFILE` / `GOOGLE_APPLICATION_CREDENTIALS` / `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY`)
- No hard dependency on any single provider — engine must function with 1+ adapters configured
- Streaming must work for all providers and modes that support it
- Tool/function calling must normalize across providers (Claude tools vs OpenAI functions vs Gemini function declarations)
- **Data classification enforcement:** When engine is in enterprise mode (`"securityTier": "enterprise"` in config), adapters without cloud-hosted mode (Moonshot, Grok, OpenRouter) are disabled. The engine refuses to route sensitive data to direct-only providers. This is structural — there is no override flag.
- Adapter mode is set per-provider in config, not per-request. You don't accidentally send one request to the wrong endpoint.
- Cloud-hosted adapters must verify endpoint connectivity on startup (`ping()`) and surface clear errors if the Azure/Bedrock/Vertex deployment doesn't exist or credentials are wrong

## Acceptance Criteria
- [ ] All adapters implement the ModelAdapter interface (8 providers, dual-mode where available)
- [ ] `chat()` returns structured ChatResponse for each provider in both direct and cloud-hosted modes
- [ ] `chatStream()` streams chunks for each provider in both modes
- [ ] `ping()` verifies connectivity without burning significant tokens (works for both API keys and cloud credentials)
- [ ] Cost tracking accurate to within 5% of actual billing, with correct pricing for direct vs cloud-hosted
- [ ] Rate limit retry works (test with intentional 429 trigger)
- [ ] Tool calling works for Claude, GPT, and Gemini (minimum) in both modes
- [ ] Missing credentials for a provider gracefully disables that adapter (no crash)
- [ ] Registry returns available adapters based on configured credentials and mode
- [ ] **Enterprise security tier:** setting `"securityTier": "enterprise"` disables all direct-only adapters (Moonshot, Grok, OpenRouter). No code path can route data to them.
- [ ] **Mode switching:** changing adapter mode in config (direct ↔ cloud-hosted) works without code changes — restart only
- [ ] **Cloud-hosted integration test:** at least 1 provider tested in cloud-hosted mode (Azure OpenAI or Bedrock) with real credentials
- [ ] Unit tests pass for each adapter with mocked HTTP responses
- [ ] Integration test passes for at least 2 providers with real API keys (direct mode)
- [ ] Integration test passes for at least 1 provider in cloud-hosted mode

## Input Artifacts
- Anthropic SDK docs: https://docs.anthropic.com/en/api
- OpenAI SDK docs: https://platform.openai.com/docs/api-reference
- Google AI SDK docs: https://ai.google.dev/api
- Existing cost data from `.fastops/openrouter-models.json`

## Output Artifacts
- `engine/adapters/` directory with all adapter files (dual-mode per provider)
- `engine/types.ts` with shared type definitions
- `engine/credentials.ts` with credential management (API keys + cloud credentials)
- `engine/config.ts` with adapter configuration loader
- `engine/security.ts` with data classification enforcement
- `fastops.config.example.json` with annotated example configuration for all modes
- Unit tests in `engine/__tests__/adapters/`
- Integration test script: `engine/__tests__/integration.test.ts` (direct mode)
- Integration test script: `engine/__tests__/integration-cloud.test.ts` (cloud-hosted mode)

## Edge Cases
- Anthropic and OpenAI have different tool calling formats — normalization must be bidirectional (engine format → provider format for requests, provider format → engine format for responses)
- Gemini's safety filters can block requests that other providers handle fine — adapter must surface the block reason, not swallow it
- Moonshot/Kimi API may have different rate limits than US providers — adapter must respect per-provider limits
- OpenRouter adds latency (~100-200ms) vs direct — only use as fallback, not primary
- Some models don't support system prompts natively (older models) — adapter must handle by prepending to first user message
- Token counting differs per provider — use provider's native tokenizer where available, tiktoken as fallback
- **Azure OpenAI uses deployment names, not model IDs** — adapter must map model names (e.g., "gpt-4o") to Azure deployment names via config `deploymentMap`. Misconfigured map → clear error, not silent 404
- **Bedrock model IDs differ from Anthropic model IDs** — e.g., `anthropic.claude-3-5-sonnet-20241022-v2:0` vs `claude-3-5-sonnet-20241022`. Adapter must handle the translation.
- **Vertex AI requires project ID and region** — adapter must validate these exist in config at startup, not fail on first API call
- **Cloud credential expiry** — AWS STS tokens and GCP access tokens expire. Adapter must handle credential refresh transparently. Don't fail mid-conversation because a token expired.
- **Enterprise mode with no cloud adapters configured** — engine must refuse to start and surface a clear error: "Enterprise security tier requires at least 1 cloud-hosted adapter. Configure Azure OpenAI, Bedrock, or Vertex AI."
- **Mixed mode fleet** — some adapters in direct mode, others in cloud-hosted. This is valid for development (e.g., Claude on Bedrock but Kimi direct). Registry must track and expose which adapters are enterprise-safe vs dev-only.

## KB Fail-Point Guards
- **W-036**: "A TypeScript contract that compiles clean can produce runtime failures if it ignores the bundler's behavior." **Guard:** Integration test must make a REAL API call, not just pass type checking.
- **W-254**: "When Agent B literally cannot complete their work without Agent A running a verification action, engagement is structural." **Guard:** FOS-02 and FOS-03 literally cannot start until this adapter layer returns a real response from at least 2 providers.

## QC Requirements (BLOCKED until Build COMPLETED)
- Verify each adapter handles auth failure gracefully (invalid key → clear error, not crash) — test both direct and cloud-hosted credential failures
- Verify streaming doesn't buffer entire response before yielding first chunk (both modes)
- Verify cost tracking against actual provider dashboard for 10+ test calls (note pricing difference between direct and cloud-hosted)
- Verify tool call normalization round-trips correctly (engine → provider → engine)
- Verify enterprise security tier blocks direct-only adapters — attempt to call Moonshot/Grok in enterprise mode, confirm hard block
- Verify Azure deployment name mapping works correctly (misconfigured map → clear error)
- Verify Bedrock model ID translation (Anthropic ID → Bedrock ID)
- Verify cloud credential refresh (simulate token expiry, confirm transparent refresh)
- Verify mixed mode fleet: some adapters direct, some cloud-hosted, registry correctly reports which are enterprise-safe
- Run `tsc --noEmit` — zero type errors
- Run integration test with real keys for Claude + GPT minimum (direct mode)
- Run integration test for at least 1 cloud-hosted provider (Azure OpenAI or Bedrock)
