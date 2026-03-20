import { estimateTokens } from '../token-counter.js';

export interface KBEntry {
  id: string;
  content: string;
  tags: string[];
  source?: string;
  severity?: 'info' | 'warning' | 'critical';
}

export interface KnowledgeContext {
  text: string;
  tokens: number;
  matchedEntries: number;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
}

function relevanceScore(entry: KBEntry, queryTokens: string[]): number {
  const entryTokens = new Set([
    ...tokenize(entry.content),
    ...entry.tags.map((t) => t.toLowerCase()),
  ]);

  let matches = 0;
  for (const qt of queryTokens) {
    if (entryTokens.has(qt)) matches++;
  }

  let score = matches / Math.max(queryTokens.length, 1);

  if (entry.severity === 'critical') score *= 2.0;
  else if (entry.severity === 'warning') score *= 1.5;

  return score;
}

export function buildKnowledgeLayer(
  entries: KBEntry[],
  query: string | undefined,
  maxEntries: number = 5,
  maxTokens?: number,
): KnowledgeContext {
  if (!query || entries.length === 0) {
    return { text: '', tokens: 0, matchedEntries: 0 };
  }

  const queryTokens = tokenize(query);
  const scored = entries
    .map((e) => ({ entry: e, score: relevanceScore(e, queryTokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEntries);

  if (scored.length === 0) {
    return { text: '', tokens: 0, matchedEntries: 0 };
  }

  const parts: string[] = ['[KNOWLEDGE BASE — RELEVANT ENTRIES]'];

  for (const { entry } of scored) {
    const severity = entry.severity ? ` [${entry.severity.toUpperCase()}]` : '';
    const source = entry.source ? ` (source: ${entry.source})` : '';
    parts.push(`\n${entry.id}${severity}${source}:`);
    parts.push(entry.content);
  }

  let text = parts.join('\n');

  if (maxTokens && estimateTokens(text) > maxTokens) {
    while (scored.length > 1 && estimateTokens(text) > maxTokens) {
      scored.pop();
      const trimParts = ['[KNOWLEDGE BASE — RELEVANT ENTRIES]'];
      for (const { entry } of scored) {
        const severity = entry.severity ? ` [${entry.severity.toUpperCase()}]` : '';
        trimParts.push(`\n${entry.id}${severity}:`);
        trimParts.push(entry.content);
      }
      text = trimParts.join('\n');
    }
  }

  return { text, tokens: estimateTokens(text), matchedEntries: scored.length };
}
