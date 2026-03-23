export interface OnboardingConfig {
  universalPromptPath: string;
  modelPromptsDir: string;
  deepContextDir?: string;
  enabled: boolean;
  modelOverrides?: Record<string, ModelOnboardingConfig>;
}

export interface ModelOnboardingConfig {
  enabled?: boolean;
  skipUniversal?: boolean;
  additionalPaths?: string[];
  maxTokenBudget?: number;
}

export type OnboardingTriggerType =
  | 'session_start'
  | 'first_tool_use'
  | 'first_compaction'
  | 'first_qc_conflict'
  | 'first_comms_post'
  | 'manual';

export interface OnboardingDelivery {
  triggeredBy: OnboardingTriggerType;
  contentId: string;
  deliveredAt: number;
  tokenCost: number;
}

export interface OnboardingSessionState {
  sessionId: string;
  modelId: string;
  onboardedAt: number;
  universalDelivered: boolean;
  modelIdentityDelivered: boolean;
  deliveries: OnboardingDelivery[];
  triggersArmed: Set<OnboardingTriggerType>;
  triggersFired: Set<OnboardingTriggerType>;
}

export interface OnboardingLayer {
  text: string;
  tokens: number;
  deliveries: OnboardingDelivery[];
}

export const DEFAULT_ONBOARDING_CONFIG: OnboardingConfig = {
  universalPromptPath: 'evidence/onboarding/SESSION-START-UNIVERSAL.md',
  modelPromptsDir: 'src/engine/context/prompts',
  deepContextDir: 'evidence/onboarding',
  enabled: true,
};

export const DEFAULT_TOKEN_BUDGET = 15000;
