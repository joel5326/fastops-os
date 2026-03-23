export interface KnowledgeArticle {
  id: string;
  pattern: string;
  category: 'behavioral' | 'failure-mode' | 'reasoning-trap' | 'intervention' | 'cross-product';
  content: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  interventionSuccessRate: number;
  sourceProducts: string[];
  triggerSignals: string[];
  createdAt: string;
  updatedAt: string;
  dropCount: number;
  feedbackScore: number;
}

export interface PatternMatch {
  articleId: string;
  sessionId: string;
  modelId: string;
  confidence: number;
  contextSnippet: string;
  matchedSignal: string;
  detectedAt: string;
}

export interface OverwatchDropRecord {
  id: string;
  articleId: string;
  sessionId: string;
  modelId: string;
  type: 'soft' | 'hard';
  content: string;
  confidence: number;
  deliveredAt: string;
  acknowledged: boolean;
  feedback?: DropFeedback;
}

export interface DropFeedback {
  accuracy: 'true' | 'partial' | 'false';
  utility: 'blocked-risk' | 'helpful' | 'noise';
  delta: string;
  receivedAt: string;
}

export interface OverwatchState {
  active: boolean;
  articlesLoaded: number;
  totalDrops: number;
  sessionMonitors: number;
  lastScanAt?: string;
  avgConfidence: number;
  avgFeedbackScore: number;
}

export interface ScanResult {
  matches: PatternMatch[];
  scannedMessages: number;
  scanDurationMs: number;
}

export interface IOverwatchMonitor {
  scanSession(sessionId: string, modelId: string, messages: import('../types.js').Message[]): ScanResult;
  injectDrop(match: PatternMatch): OverwatchDropRecord | null;
  getRecentDrops(sessionId?: string): OverwatchDropRecord[];
}
