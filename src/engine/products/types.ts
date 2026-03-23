export interface ProductRegistration {
  id: string;
  name: string;
  repoPath: string;
  missionsDir: string;
  contextDir: string;
  deliverablesDir?: string;
  debriefsDir?: string;
  active: boolean;
}

export interface ProductConfig {
  product: string;
  name: string;
  version: string;
  engine: {
    contextDir: string;
    missionsDir: string;
    deliverablesDir?: string;
    debriefsDir?: string;
  };
  onboarding?: {
    domainContext?: string;
    maxTokens?: number;
  };
}

export interface ProductMission {
  id: string;
  productId: string;
  name: string;
  status: string;
  priority: number | string;
  owner?: string;
  filePath: string;
}

export interface ProductContextLayer {
  text: string;
  tokens: number;
  productId: string;
}

export interface LoadedProduct {
  registration: ProductRegistration;
  config: ProductConfig;
  missions: ProductMission[];
  domainContext?: string;
}

export interface OverwatchConfig {
  enabled: boolean;
  knowledgeRepoPath?: string;
  injectionMode: 'soft' | 'hard' | 'both';
  pollingIntervalMs: number;
}

export interface KnowledgeServiceConfig {
  repoPath?: string;
  extractionSchedule: 'on-commit' | 'hourly' | 'manual';
  maxArticlesPerInjection: number;
}

export interface OverwatchDrop {
  type: 'soft' | 'hard';
  pattern: string;
  content: string;
  confidence: number;
  source: 'cross-product';
  blocking: boolean;
  injectedAt: string;
}
