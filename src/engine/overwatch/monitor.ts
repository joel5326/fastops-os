import { randomUUID } from 'crypto';
import type { EventBus } from '../core/event-bus.js';
import type { ContextManager } from '../context/manager.js';
import type { Message } from '../types.js';
import type { OverwatchDrop } from '../products/types.js';
import { KnowledgeStore } from './knowledge-store.js';
import type {
  KnowledgeArticle,
  PatternMatch,
  OverwatchDropRecord,
  DropFeedback,
  OverwatchState,
  ScanResult,
} from './types.js';

export interface OverwatchMonitorConfig {
  softThreshold: number;
  hardThreshold: number;
  maxDropsPerSession: number;
  cooldownMs: number;
}

const DEFAULT_CONFIG: OverwatchMonitorConfig = {
  softThreshold: 0.70,
  hardThreshold: 0.85,
  maxDropsPerSession: 5,
  cooldownMs: 120_000,
};

export class OverwatchMonitor {
  private readonly knowledge: KnowledgeStore;
  private readonly events: EventBus;
  private readonly contextManager: ContextManager;
  private readonly config: OverwatchMonitorConfig;
  private drops: OverwatchDropRecord[] = [];
  private sessionDropCounts = new Map<string, number>();
  private sessionLastDrop = new Map<string, number>();
  private active = false;

  constructor(
    knowledge: KnowledgeStore,
    events: EventBus,
    contextManager: ContextManager,
    config?: Partial<OverwatchMonitorConfig>,
  ) {
    this.knowledge = knowledge;
    this.events = events;
    this.contextManager = contextManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    this.active = true;
    this.events.emit('overwatch.started', { articlesLoaded: this.knowledge.size() });
  }

  stop(): void {
    this.active = false;
    this.events.emit('overwatch.stopped', {});
  }

  isActive(): boolean {
    return this.active;
  }

  scanSession(
    sessionId: string,
    modelId: string,
    messages: Message[],
  ): ScanResult {
    const start = Date.now();
    const matches: PatternMatch[] = [];

    const recentMessages = messages.slice(-10);
    const combinedText = recentMessages.map((m) => m.content).join(' ');

    const candidateArticles = this.knowledge.findBySignal(combinedText);

    for (const article of candidateArticles) {
      const confidence = this.calculateConfidence(article, combinedText, recentMessages);

      if (confidence >= this.config.softThreshold) {
        matches.push({
          articleId: article.id,
          sessionId,
          modelId,
          confidence,
          contextSnippet: combinedText.slice(0, 200),
          matchedSignal: article.triggerSignals.find((s) =>
            combinedText.toLowerCase().includes(s.toLowerCase()),
          ) ?? '',
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      matches: matches.sort((a, b) => b.confidence - a.confidence),
      scannedMessages: recentMessages.length,
      scanDurationMs: Date.now() - start,
    };
  }

  injectDrop(
    match: PatternMatch,
  ): OverwatchDropRecord | null {
    if (!this.active) return null;

    const sessionCount = this.sessionDropCounts.get(match.sessionId) ?? 0;
    if (sessionCount >= this.config.maxDropsPerSession) return null;

    const lastDrop = this.sessionLastDrop.get(match.sessionId) ?? 0;
    if (Date.now() - lastDrop < this.config.cooldownMs) return null;

    const article = this.knowledge.get(match.articleId);
    if (!article) return null;

    const dropType = match.confidence >= this.config.hardThreshold ? 'hard' : 'soft';

    const overwatchDrop: OverwatchDrop = {
      type: dropType,
      pattern: article.pattern,
      content: article.content,
      confidence: match.confidence,
      source: 'cross-product',
      blocking: dropType === 'hard',
      injectedAt: new Date().toISOString(),
    };

    this.contextManager.enqueueOverwatchDrop(match.sessionId, overwatchDrop);

    const record: OverwatchDropRecord = {
      id: randomUUID(),
      articleId: match.articleId,
      sessionId: match.sessionId,
      modelId: match.modelId,
      type: dropType,
      content: article.content,
      confidence: match.confidence,
      deliveredAt: new Date().toISOString(),
      acknowledged: false,
    };

    this.drops.push(record);
    this.sessionDropCounts.set(match.sessionId, sessionCount + 1);
    this.sessionLastDrop.set(match.sessionId, Date.now());
    this.knowledge.recordDrop(match.articleId);

    this.events.emit('overwatch.drop', {
      dropId: record.id,
      articleId: match.articleId,
      sessionId: match.sessionId,
      modelId: match.modelId,
      type: dropType,
      confidence: match.confidence,
    });

    return record;
  }

  recordFeedback(dropId: string, feedback: DropFeedback): boolean {
    const drop = this.drops.find((d) => d.id === dropId);
    if (!drop) return false;

    drop.acknowledged = true;
    drop.feedback = feedback;

    const score = feedback.accuracy === 'true' ? 1.0
      : feedback.accuracy === 'partial' ? 0.5
      : 0.0;

    this.knowledge.recordFeedback(drop.articleId, score);

    this.events.emit('overwatch.feedback', {
      dropId,
      articleId: drop.articleId,
      accuracy: feedback.accuracy,
      utility: feedback.utility,
    });

    return true;
  }

  getRecentDrops(sessionId?: string, limit = 20): OverwatchDropRecord[] {
    let filtered = this.drops;
    if (sessionId) {
      filtered = filtered.filter((d) => d.sessionId === sessionId);
    }
    return filtered.slice(-limit);
  }

  getState(): OverwatchState {
    const avgConfidence = this.drops.length > 0
      ? this.drops.reduce((sum, d) => sum + d.confidence, 0) / this.drops.length
      : 0;

    const withFeedback = this.drops.filter((d) => d.feedback);
    const avgFeedbackScore = withFeedback.length > 0
      ? withFeedback.reduce((sum, d) => {
          const s = d.feedback!.accuracy === 'true' ? 1 : d.feedback!.accuracy === 'partial' ? 0.5 : 0;
          return sum + s;
        }, 0) / withFeedback.length
      : 0;

    return {
      active: this.active,
      articlesLoaded: this.knowledge.size(),
      totalDrops: this.drops.length,
      sessionMonitors: this.sessionDropCounts.size,
      lastScanAt: this.drops.length > 0
        ? this.drops[this.drops.length - 1].deliveredAt
        : undefined,
      avgConfidence,
      avgFeedbackScore,
    };
  }

  private calculateConfidence(
    article: KnowledgeArticle,
    text: string,
    messages: Message[],
  ): number {
    let score = 0;
    const lower = text.toLowerCase();

    let signalMatches = 0;
    for (const signal of article.triggerSignals) {
      if (lower.includes(signal.toLowerCase())) {
        signalMatches++;
      }
    }
    score += Math.min(signalMatches / Math.max(article.triggerSignals.length, 1), 1.0) * 0.5;

    const severityBoost: Record<string, number> = {
      critical: 0.2,
      high: 0.15,
      medium: 0.1,
      low: 0.05,
    };
    score += severityBoost[article.severity] ?? 0;

    if (article.interventionSuccessRate > 0.7) {
      score += 0.15;
    } else if (article.interventionSuccessRate > 0.5) {
      score += 0.1;
    }

    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    if (assistantMessages.length > 0) {
      const lastAssistant = assistantMessages[assistantMessages.length - 1].content.toLowerCase();
      for (const signal of article.triggerSignals) {
        if (lastAssistant.includes(signal.toLowerCase())) {
          score += 0.1;
          break;
        }
      }
    }

    return Math.min(score, 1.0);
  }
}
