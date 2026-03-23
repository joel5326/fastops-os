import { readFileSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { estimateTokens } from '../context/token-counter.js';
import type {
  OnboardingConfig,
  OnboardingSessionState,
  OnboardingLayer,
  OnboardingDelivery,
  OnboardingTriggerType,
} from './types.js';
import { DEFAULT_ONBOARDING_CONFIG, DEFAULT_TOKEN_BUDGET } from './types.js';

export class OnboardingLoader {
  private config: OnboardingConfig;
  private workingDirectory: string;
  private sessions = new Map<string, OnboardingSessionState>();
  private onboardedModels = new Set<string>();
  private universalPromptCache: { text: string; mtime: number } | null = null;
  private modelPromptCache = new Map<string, { text: string; mtime: number }>();

  constructor(workingDirectory: string, config?: Partial<OnboardingConfig>) {
    this.workingDirectory = workingDirectory;
    this.config = { ...DEFAULT_ONBOARDING_CONFIG, ...config };
  }

  initSession(sessionId: string, modelId: string): OnboardingSessionState {
    const state: OnboardingSessionState = {
      sessionId,
      modelId,
      onboardedAt: Date.now(),
      universalDelivered: false,
      modelIdentityDelivered: false,
      deliveries: [],
      triggersArmed: new Set([
        'first_tool_use',
        'first_compaction',
        'first_qc_conflict',
        'first_comms_post',
      ]),
      triggersFired: new Set(),
    };

    this.sessions.set(sessionId, state);
    return state;
  }

  getSessionState(sessionId: string): OnboardingSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  hasModelCompletedOnboarding(modelId: string): boolean {
    return this.onboardedModels.has(modelId);
  }

  markModelOnboarded(modelId: string): void {
    if (!modelId.trim()) return;
    this.onboardedModels.add(modelId);
  }

  isOnboarded(sessionId: string): boolean {
    const state = this.sessions.get(sessionId);
    return state?.universalDelivered === true;
  }

  buildOnboardingLayer(sessionId: string, modelId: string): OnboardingLayer {
    if (!this.config.enabled) {
      return { text: '', tokens: 0, deliveries: [] };
    }

    let state = this.sessions.get(sessionId);
    if (!state) {
      state = this.initSession(sessionId, modelId);
    }

    const modelConfig = this.config.modelOverrides?.[modelId];
    if (modelConfig?.enabled === false) {
      return { text: '', tokens: 0, deliveries: [] };
    }

    const maxBudget = modelConfig?.maxTokenBudget ?? DEFAULT_TOKEN_BUDGET;
    const parts: string[] = [];
    const deliveries: OnboardingDelivery[] = [];
    let tokensUsed = 0;

    if (!modelConfig?.skipUniversal) {
      const universal = this.loadUniversalPrompt();
      if (universal) {
        const universalTokens = estimateTokens(universal);
        if (tokensUsed + universalTokens <= maxBudget) {
          parts.push(universal);
          tokensUsed += universalTokens;
          state.universalDelivered = true;
          this.onboardedModels.add(modelId);

          deliveries.push({
            triggeredBy: 'session_start',
            contentId: 'universal-session-start',
            deliveredAt: Date.now(),
            tokenCost: universalTokens,
          });
        }
      }
    }

    const modelPrompt = this.loadModelPrompt(modelId);
    if (modelPrompt) {
      const modelTokens = estimateTokens(modelPrompt);
      if (tokensUsed + modelTokens <= maxBudget) {
        parts.push(modelPrompt);
        tokensUsed += modelTokens;
        state.modelIdentityDelivered = true;

        deliveries.push({
          triggeredBy: 'session_start',
          contentId: `model-identity-${modelId}`,
          deliveredAt: Date.now(),
          tokenCost: modelTokens,
        });
      }
    }

    if (modelConfig?.additionalPaths) {
      for (const relPath of modelConfig.additionalPaths) {
        const fullPath = resolve(this.workingDirectory, relPath);
        if (existsSync(fullPath)) {
          const text = readFileSync(fullPath, 'utf8');
          const textTokens = estimateTokens(text);
          if (tokensUsed + textTokens <= maxBudget) {
            parts.push(text);
            tokensUsed += textTokens;
            deliveries.push({
              triggeredBy: 'session_start',
              contentId: relPath,
              deliveredAt: Date.now(),
              tokenCost: textTokens,
            });
          }
        }
      }
    }

    state.deliveries.push(...deliveries);

    const text = parts.join('\n\n---\n\n');
    return {
      text,
      tokens: estimateTokens(text),
      deliveries,
    };
  }

  fireTrigger(
    sessionId: string,
    modelId: string,
    trigger: OnboardingTriggerType,
  ): { delivery: OnboardingDelivery; text: string } | null {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = this.initSession(sessionId, modelId);
    }
    if (!state.triggersArmed.has(trigger)) return null;
    if (state.triggersFired.has(trigger)) return null;

    const content = this.loadTriggerContent(trigger);
    if (!content) return null;

    state.triggersFired.add(trigger);
    state.triggersArmed.delete(trigger);

    const delivery: OnboardingDelivery = {
      triggeredBy: trigger,
      contentId: `trigger-${trigger}`,
      deliveredAt: Date.now(),
      tokenCost: estimateTokens(content),
    };

    state.deliveries.push(delivery);
    return { delivery, text: content };
  }

  getTriggerContent(trigger: OnboardingTriggerType): string | null {
    return this.loadTriggerContent(trigger);
  }

  getStatus(sessionId: string): {
    onboarded: boolean;
    universalDelivered: boolean;
    modelIdentityDelivered: boolean;
    totalDeliveries: number;
    totalTokensSpent: number;
    triggersArmed: string[];
    triggersFired: string[];
  } | null {
    const state = this.sessions.get(sessionId);
    if (!state) return null;

    return {
      onboarded: state.universalDelivered,
      universalDelivered: state.universalDelivered,
      modelIdentityDelivered: state.modelIdentityDelivered,
      totalDeliveries: state.deliveries.length,
      totalTokensSpent: state.deliveries.reduce((sum, d) => sum + d.tokenCost, 0),
      triggersArmed: Array.from(state.triggersArmed),
      triggersFired: Array.from(state.triggersFired),
    };
  }

  updateConfig(patch: Partial<OnboardingConfig>): void {
    this.config = { ...this.config, ...patch };
    this.universalPromptCache = null;
    this.modelPromptCache.clear();
  }

  private loadUniversalPrompt(): string | null {
    const fullPath = resolve(this.workingDirectory, this.config.universalPromptPath);
    if (!existsSync(fullPath)) return null;

    const stat = statSync(fullPath);
    if (this.universalPromptCache && this.universalPromptCache.mtime === stat.mtimeMs) {
      return this.universalPromptCache.text;
    }

    const text = readFileSync(fullPath, 'utf8');
    this.universalPromptCache = { text, mtime: stat.mtimeMs };
    return text;
  }

  private loadModelPrompt(modelId: string): string | null {
    const filePath = join(
      resolve(this.workingDirectory, this.config.modelPromptsDir),
      `${modelId}.md`,
    );
    if (!existsSync(filePath)) return null;

    const stat = statSync(filePath);
    const cached = this.modelPromptCache.get(modelId);
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.text;
    }

    const text = readFileSync(filePath, 'utf8');
    this.modelPromptCache.set(modelId, { text, mtime: stat.mtimeMs });
    return text;
  }

  private loadTriggerContent(trigger: OnboardingTriggerType): string | null {
    const deepDir = this.config.deepContextDir;
    if (!deepDir) return null;

    const triggerFiles: Record<string, string> = {
      'first_tool_use': 'TRIGGER-FIRST-TOOL.md',
      'first_compaction': 'TRIGGER-FIRST-COMPACTION.md',
      'first_qc_conflict': 'TRIGGER-QC-CONFLICT.md',
      'first_comms_post': 'TRIGGER-FIRST-COMMS.md',
    };

    const filename = triggerFiles[trigger];
    if (!filename) return null;

    const fullPath = resolve(this.workingDirectory, deepDir, filename);
    if (!existsSync(fullPath)) return null;

    return readFileSync(fullPath, 'utf8');
  }
}
