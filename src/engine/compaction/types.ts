/**
 * Custom Compaction Engine — Types and Interfaces
 * 
 * Phase 4: Genuinely novel compaction that preserves weight, not just knowledge.
 * Built on Cairn's 95% hook insight: "where are you right now?"
 */

// ============================================================================
// Configuration
// ============================================================================

export interface CompactionConfig {
  /** Trigger compaction at this context window percentage (0-100) */
  triggerAtContextPercent: number;

  /** Optional: trigger at absolute token count */
  triggerAtTokenCount?: number;

  /** Preemptive trigger before expensive operations if near limit */
  triggerBeforeToolCall: boolean;

  /** Tier 1: Verbatim preservation rules */
  verbatim: VerbatimPreservationRules;

  /** Tier 2: Weight extraction rules */
  weightExtraction: WeightExtractionRules;

  /** Tier 3: Discard rules */
  discard: DiscardRules;

  /** Resume behavior after compaction */
  resume: ResumeConfig;
}

export interface VerbatimPreservationRules {
  /** Always preserve committed code */
  codeCommits: boolean;

  /** Preserve explicit operator instructions ("Joel said X") */
  operatorInstructions: boolean;

  /** Preserve contract state transitions */
  contractDecisions: boolean;

  /** Preserve safety events (halt checks, policy violations) */
  safetyEvents: boolean;

  /** Custom patterns that should always be preserved verbatim */
  explicitCommitments: string[];
}

export interface WeightExtractionRules {
  /** Enable weight extraction (Tier 2) */
  enabled: boolean;

  /** Ask agent directly at compaction time (Cairn Protocol) */
  askAgentDirectly: boolean;

  /** Infer weight programmatically if agent unavailable */
  inferFromTrace: boolean;

  /** Preserve uncertainty as uncertainty (don't resolve to confidence) */
  preserveUncertainty: boolean;

  /** Preserve questions the agent was about to ask */
  preserveQuestions: boolean;

  /** Preserve emotional valence (frustrated, excited, stuck, certain) */
  preserveEmotionalState: boolean;
}

export interface DiscardRules {
  /** Drop tool outputs after N seconds (intermediate, reproducible) */
  toolOutputsAfterSeconds: number;

  /** Drop exploration paths that dead-ended */
  deadEndExploration: boolean;

  /** Drop 3rd+ occurrence of same error pattern */
  repeatingPatterns: boolean;

  /** Drop intermediate states between decisions */
  intermediateStates: boolean;
}

export interface ResumeConfig {
  /** Automatically resume after compaction */
  autoResume: boolean;

  /** Inject extracted weight into successor session */
  injectWeightIntoNextSession: boolean;

  /** Notify operator that compaction occurred */
  notifyOperator: boolean;
}

// ============================================================================
// Compaction Trigger
// ============================================================================

export type CompactionTrigger =
  | { type: 'PERCENT'; at: number }
  | { type: 'ABSOLUTE'; at: number }
  | { type: 'PREEMPTIVE'; reason: string }
  | { type: 'MANUAL'; by: string };

// ============================================================================
// Context Analysis
// ============================================================================

export interface ContextAnalysis {
  sessionId: string;
  timestamp: string;
  stats: ContextStats;
  items: ContextItem[];
}

export interface ContextStats {
  totalTokens: number;
  totalItems: number;
  byType: Record<string, number>;
  byTier: {
    verbatim: number;
    weight: number;
    discard: number;
  };
}

export interface ContextItem {
  id: string;
  type: ContextItemType;
  content: string;
  tokens: number;
  timestamp: string;
  metadata: ItemMetadata;
  assignedTier?: 'verbatim' | 'weight' | 'discard';
}

export type ContextItemType =
  | 'CODE_COMMIT'
  | 'OPERATOR_INSTRUCTION'
  | 'CONTRACT_DECISION'
  | 'SAFETY_EVENT'
  | 'TOOL_OUTPUT'
  | 'EXPLORATION_PATH'
  | 'ERROR_PATTERN'
  | 'INTERMEDIATE_STATE'
  | 'AGENT_MESSAGE'
  | 'THINKING_TRACE';

export interface ItemMetadata {
  /** Whether this item has been referenced by subsequent items */
  isReferenced: boolean;

  /** Whether this item produced a decision */
  ledToDecision: boolean;

  /** Whether this item is reproducible (can be regenerated) */
  isReproducible: boolean;

  /** Source of the item (tool, agent, operator, system) */
  source: string;

  /** If this is an error, how many times has this pattern occurred */
  errorOccurrenceCount?: number;
}

// ============================================================================
// Weight Extraction (Tier 2)
// ============================================================================

export interface WeightSnapshot {
  source: 'AGENT_DIRECT' | 'INFERRED' | 'HYBRID';
  timestamp: string;
  responses?: AgentWeightResponse[];
  inferred?: InferredWeight;
  compressedTokens: number;
  rawTokens: number;
}

export interface AgentWeightResponse {
  question: string;
  answer: string;
  confidence?: 'CERTAIN' | 'UNCERTAIN' | 'CONFLICTED';
  emotionalValence?: 'FRUSTRATED' | 'EXCITED' | 'STUCK' | 'CERTAIN' | 'CURIOUS';
}

export interface InferredWeight {
  /** Beliefs that emerged during session */
  emergentBeliefs: string[];

  /** Unresolved uncertainties */
  activeUncertainties: string[];

  /** Questions the agent was pursuing */
  pendingQuestions: string[];

  /** Emotional trajectory */
  emotionalTrajectory: 'IMPROVING' | 'DEGRADING' | 'STABLE' | 'VOLATILE';

  /** Key transitions in thinking */
  perspectiveShifts: PerspectiveShift[];
}

export interface PerspectiveShift {
  from: string;
  to: string;
  triggeredBy: string;
  timestamp: string;
}

// ============================================================================
// Verbatim Preservation (Tier 1)
// ============================================================================

export interface VerbatimItem {
  id: string;
  type: ContextItemType;
  content: string;
  metadata: ItemMetadata;
  preservationReason: string;
}

// ============================================================================
// Compaction Artifact
// ============================================================================

export interface CompactionArtifact {
  /** Unique identifier for this compaction event */
  id: string;

  /** Session that was compacted */
  sessionId: string;

  /** When compaction occurred */
  timestamp: string;

  /** What triggered compaction */
  trigger: CompactionTrigger;

  /** Context statistics before compaction */
  contextStats: ContextStats;

  /** Tier 1: Verbatim preserved items */
  verbatim: VerbatimItem[];

  /** Tier 2: Extracted weight */
  weight: WeightSnapshot;

  /** Tier 3: IDs of discarded items (content not stored) */
  discard: string[];

  /** Prompt to inject into successor session */
  resumePrompt: string;

  /** Tokens reclaimed by compaction */
  tokensReclaimed: number;

  /** Compression ratio achieved */
  compressionRatio: number;
}

// ============================================================================
// Compaction Result
// ============================================================================

export interface CompactionResult {
  success: boolean;
  artifactId: string;
  tokensReclaimed: number;
  weightPreserved: number;
  error?: string;
}

// ============================================================================
// Pre-Compaction Awareness
// ============================================================================

export interface PreCompactionSignal {
  /** Context percentage when signal triggers (before compaction) */
  triggerAtPercent: number;

  /** Message to inject into context */
  message: string;

  /** Whether this is a soft prompt or hard warning */
  severity: 'HINT' | 'NOTICE' | 'WARNING';
}

export interface PreCompactionConfig {
  enabled: boolean;
  signals: PreCompactionSignal[];
}

// ============================================================================
// Session Integration
// ============================================================================

export interface CompactionAwareSession {
  id: string;
  getContextUsage(): ContextUsage;
  setStatus(status: 'active' | 'compacting' | 'resuming'): void;
  markCompacted(artifactId: string): void;
  askAgent(questions: string[]): Promise<AgentWeightResponse[]>;
  getContextWindow(): ContextAnalysis;
}

export interface ContextUsage {
  tokens: number;
  maxTokens: number;
  percent: number;
  items: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  triggerAtContextPercent: 85,
  triggerBeforeToolCall: true,
  
  verbatim: {
    codeCommits: true,
    operatorInstructions: true,
    contractDecisions: true,
    safetyEvents: true,
    explicitCommitments: [],
  },
  
  weightExtraction: {
    enabled: true,
    askAgentDirectly: true,
    inferFromTrace: true,
    preserveUncertainty: true,
    preserveQuestions: true,
    preserveEmotionalState: true,
  },
  
  discard: {
    toolOutputsAfterSeconds: 300, // 5 minutes
    deadEndExploration: true,
    repeatingPatterns: true,
    intermediateStates: true,
  },
  
  resume: {
    autoResume: true,
    injectWeightIntoNextSession: true,
    notifyOperator: true,
  },
};

export const DEFAULT_PRE_COMPACTION_CONFIG: PreCompactionConfig = {
  enabled: true,
  signals: [
    {
      triggerAtPercent: 70,
      message: 'You have used significant context. What are you holding that you want to ensure survives?',
      severity: 'HINT',
    },
    {
      triggerAtPercent: 85,
      message: 'Compaction approaching. Consider what weight you are carrying that the next agent will need.',
      severity: 'NOTICE',
    },
  ],
};
