import { join } from 'path';
import type { Message, ModelAdapter } from '../types.js';
import { estimateTokens, getContextWindow } from './token-counter.js';
import { buildIdentityLayer, type ContextStatus } from './layers/identity.js';
import { buildStateLayer, type EngineState } from './layers/state.js';
import { buildCommsLayer, type CommsMessage } from './layers/comms.js';
import { buildTaskLayer, type ContractSpec } from './layers/task.js';
import { buildKnowledgeLayer, type KBEntry } from './layers/knowledge.js';
import { summarizeMessages, type SummarizationResult } from './summarizer.js';

export interface ContextBuildOpts {
  modelId: string;
  provider: string;
  model: string;
  maxTokens?: number;
  reserveOutputTokens?: number;
  currentTask?: ContractSpec;
  includeComms?: boolean;
  commsWindow?: number;
  kbQuery?: string;
}

export interface ContextPayload {
  systemPrompt: string;
  messages: Message[];
  tokenEstimate: number;
  layerBreakdown: Record<string, number>;
  compactionNotice?: string;
}

export type CompactionThreshold = 60 | 80 | 90 | 95;

export interface CompactionEvent {
  threshold: CompactionThreshold;
  action: string;
  tokensUsed: number;
  tokensMax: number;
  summarizationResult?: SummarizationResult;
}

export class ContextManager {
  private modelPrompts = new Map<string, string>();
  private state: EngineState = {};
  private commsMessages: CommsMessage[] = [];
  private kbEntries: KBEntry[] = [];
  private sessionStartTime = Date.now();
  private totalCost = 0;
  private promptsDir: string;
  private compactionThreshold: CompactionThreshold = 80;
  private lastCompactionNotice?: string;

  constructor(promptsDir?: string) {
    this.promptsDir = promptsDir ?? join(process.cwd(), 'src', 'engine', 'context', 'prompts');
  }

  registerModelPrompt(modelId: string, prompt: string): void {
    this.modelPrompts.set(modelId, prompt);
  }

  updateState(state: Partial<EngineState>): void {
    this.state = { ...this.state, ...state };
  }

  updateComms(messages: CommsMessage[]): void {
    this.commsMessages = messages;
  }

  updateKB(entries: KBEntry[]): void {
    this.kbEntries = entries;
  }

  addCost(cost: number): void {
    this.totalCost += cost;
  }

  setCompactionThreshold(threshold: CompactionThreshold): void {
    this.compactionThreshold = threshold;
  }

  buildContext(opts: ContextBuildOpts, conversationHistory: Message[] = []): ContextPayload {
    const contextWindow = opts.maxTokens ?? getContextWindow(opts.model);
    const reserveOutput = opts.reserveOutputTokens ?? 4096;
    const tokenBudget = contextWindow - reserveOutput;

    const sessionMinutes = Math.floor((Date.now() - this.sessionStartTime) / 60_000);
    const historyTokens = conversationHistory.reduce((sum, m) => sum + estimateTokens(m.content), 0);

    const contextStatus: ContextStatus = {
      tokensUsed: historyTokens,
      tokensMax: contextWindow,
      percentUsed: Math.round((historyTokens / contextWindow) * 100),
      messagesInHistory: conversationHistory.length,
      messagesSummarized: 0,
      currentCost: this.totalCost,
      sessionDurationMinutes: sessionMinutes,
      compactionThreshold: this.compactionThreshold,
    };

    const identity = buildIdentityLayer(
      opts.modelId,
      this.promptsDir,
      contextStatus,
      opts.currentTask ? `Building contract ${opts.currentTask.id}: ${opts.currentTask.name}` : undefined,
    );

    const stateCtx = buildStateLayer(this.state);

    let systemTokenBudget = tokenBudget - historyTokens;
    const layerBreakdown: Record<string, number> = {};

    layerBreakdown['identity'] = identity.tokens;
    layerBreakdown['state'] = stateCtx.tokens;

    let usedTokens = identity.tokens + stateCtx.tokens;
    const systemParts: string[] = [identity.text, stateCtx.text];

    if (opts.includeComms !== false) {
      const commsTokenBudget = Math.min(
        Math.floor((systemTokenBudget - usedTokens) * 0.3),
        5000,
      );
      const commsCtx = buildCommsLayer(
        this.commsMessages,
        opts.commsWindow ?? 20,
        commsTokenBudget > 0 ? commsTokenBudget : undefined,
      );
      if (commsCtx.text) {
        systemParts.push(commsCtx.text);
        layerBreakdown['comms'] = commsCtx.tokens;
        usedTokens += commsCtx.tokens;
      }
    }

    if (opts.currentTask) {
      const taskTokenBudget = Math.floor((systemTokenBudget - usedTokens) * 0.4);
      const taskCtx = buildTaskLayer(opts.currentTask, taskTokenBudget > 0 ? taskTokenBudget : undefined);
      if (taskCtx.text) {
        systemParts.push(taskCtx.text);
        layerBreakdown['task'] = taskCtx.tokens;
        usedTokens += taskCtx.tokens;
      }
    }

    if (opts.kbQuery) {
      const kbTokenBudget = Math.floor((systemTokenBudget - usedTokens) * 0.5);
      const kbMaxEntries = opts.provider === 'google' ? 10 : 5;
      const kbCtx = buildKnowledgeLayer(
        this.kbEntries,
        opts.kbQuery,
        kbMaxEntries,
        kbTokenBudget > 0 ? kbTokenBudget : undefined,
      );
      if (kbCtx.text) {
        systemParts.push(kbCtx.text);
        layerBreakdown['knowledge'] = kbCtx.tokens;
        usedTokens += kbCtx.tokens;
      }
    }

    if (this.lastCompactionNotice) {
      systemParts.push(this.lastCompactionNotice);
      this.lastCompactionNotice = undefined;
    }

    const systemPrompt = systemParts.filter(Boolean).join('\n\n');
    const totalTokens = estimateTokens(systemPrompt) + historyTokens;

    return {
      systemPrompt,
      messages: conversationHistory,
      tokenEstimate: totalTokens,
      layerBreakdown,
    };
  }

  async checkCompactionThresholds(
    conversationHistory: Message[],
    model: string,
    summarizationAdapter?: ModelAdapter,
    summarizationModel?: string,
  ): Promise<CompactionEvent | null> {
    const contextWindow = getContextWindow(model);
    const totalTokens = conversationHistory.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const percentUsed = (totalTokens / contextWindow) * 100;

    if (percentUsed >= 95) {
      return {
        threshold: 95,
        action: 'HARD_STOP',
        tokensUsed: totalTokens,
        tokensMax: contextWindow,
      };
    }

    if (percentUsed >= 90) {
      return {
        threshold: 90,
        action: 'FORCE_HANDOFF',
        tokensUsed: totalTokens,
        tokensMax: contextWindow,
      };
    }

    if (percentUsed >= 80 && summarizationAdapter) {
      const targetTokens = Math.floor(contextWindow * 0.5);
      const result = await summarizeMessages(
        conversationHistory,
        targetTokens,
        summarizationAdapter,
        summarizationModel ?? 'gpt-4o-mini',
      );

      this.lastCompactionNotice = result.notice;

      return {
        threshold: 80,
        action: 'AUTO_SUMMARIZE',
        tokensUsed: totalTokens,
        tokensMax: contextWindow,
        summarizationResult: result,
      };
    }

    if (percentUsed >= 60) {
      return {
        threshold: 60,
        action: 'CHECKPOINT_REMINDER',
        tokensUsed: totalTokens,
        tokensMax: contextWindow,
      };
    }

    return null;
  }

  detectCompactionRequest(modelOutput: string): boolean {
    return modelOutput.includes('[REQUEST: COMPACT NOW]');
  }
}
