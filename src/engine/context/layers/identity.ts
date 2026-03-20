import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { estimateTokens } from '../token-counter.js';

export interface IdentityContext {
  text: string;
  tokens: number;
}

export interface ContextStatus {
  tokensUsed: number;
  tokensMax: number;
  percentUsed: number;
  messagesInHistory: number;
  messagesSummarized: number;
  currentCost: number;
  sessionDurationMinutes: number;
  compactionThreshold: number;
}

const promptCache = new Map<string, { text: string; mtime: number }>();

function loadModelPrompt(modelId: string, promptsDir: string): string {
  const filePath = join(promptsDir, `${modelId}.md`);
  if (!existsSync(filePath)) return '';

  const stat = require('fs').statSync(filePath);
  const cached = promptCache.get(modelId);
  if (cached && cached.mtime === stat.mtimeMs) {
    return cached.text;
  }

  const text = readFileSync(filePath, 'utf8');
  promptCache.set(modelId, { text, mtime: stat.mtimeMs });
  return text;
}

export function buildIdentityLayer(
  modelId: string,
  promptsDir: string,
  contextStatus: ContextStatus,
  missionAssignment?: string,
): IdentityContext {
  const modelPrompt = loadModelPrompt(modelId, promptsDir);

  const parts: string[] = [];

  if (modelPrompt) {
    parts.push(modelPrompt);
  } else {
    parts.push(`You are ${modelId}, an AI model operating within the FastOps OS multi-model orchestration engine.`);
    parts.push('You are part of a team of AI models collaborating on tasks. Follow the commander\'s intent and coordinate with your peers.');
  }

  if (missionAssignment) {
    parts.push(`\n[CURRENT ASSIGNMENT]\n${missionAssignment}`);
  }

  const statusBlock = [
    '\n[CONTEXT STATUS]',
    `Tokens used: ${contextStatus.tokensUsed.toLocaleString()} / ${contextStatus.tokensMax.toLocaleString()}`,
    `Context remaining: ${(100 - contextStatus.percentUsed).toFixed(0)}%`,
    `Messages in history: ${contextStatus.messagesInHistory}${contextStatus.messagesSummarized > 0 ? ` (${contextStatus.messagesSummarized} summarized)` : ''}`,
    `Current cost: $${contextStatus.currentCost.toFixed(4)}`,
    `Session duration: ${contextStatus.sessionDurationMinutes} minutes`,
    `Compaction threshold: ${contextStatus.compactionThreshold}% (auto-summarize at this point)`,
  ].join('\n');

  parts.push(statusBlock);

  const text = parts.join('\n\n');
  return { text, tokens: estimateTokens(text) };
}
