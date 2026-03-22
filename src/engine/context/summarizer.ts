import type { Message, ModelAdapter } from '../types.js';
import { estimateTokens } from './token-counter.js';
import {
  DEFAULT_SUMMARIZATION_POLICY,
  shouldPreserveVerbatim,
  type SummarizationPolicy,
} from './compaction-policy.js';

export interface SummarizationResult {
  messages: Message[];
  tokensRecovered: number;
  summarizedCount: number;
  preservedVerbatim: string[];
  notice: string;
}

export async function summarizeMessages(
  messages: Message[],
  targetTokens: number,
  adapter: ModelAdapter,
  model: string,
  policy: SummarizationPolicy = DEFAULT_SUMMARIZATION_POLICY,
): Promise<SummarizationResult> {
  const currentTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  if (currentTokens <= targetTokens) {
    return {
      messages,
      tokensRecovered: 0,
      summarizedCount: 0,
      preservedVerbatim: [],
      notice: 'No summarization needed — within token budget.',
    };
  }

  const preserved: Message[] = [];
  const toSummarize: Message[] = [];
  const preservedReasons: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const preservation = shouldPreserveVerbatim(msg, i, messages.length, policy);
    if (preservation.preserve) {
      preserved.push(msg);
      preservedReasons.push(preservation.reason ?? 'preserved');
    } else {
      toSummarize.push(msg);
    }
  }

  if (toSummarize.length === 0) {
    return {
      messages,
      tokensRecovered: 0,
      summarizedCount: 0,
      preservedVerbatim: preservedReasons,
      notice: 'No messages eligible for summarization.',
    };
  }

  const summaryPrompt = [
    'Summarize the following conversation messages into a single concise summary.',
    'Preserve: key decisions, open questions, action items, errors encountered.',
    'Discard: greetings, acknowledgments, superseded approaches, exploration that led nowhere.',
    'Output a summary paragraph, NOT a list of messages.',
    '',
    '--- MESSAGES TO SUMMARIZE ---',
    ...toSummarize.map((m) => `[${m.role}]: ${m.content}`),
  ].join('\n');

  const response = await adapter.chat({
    model,
    systemPrompt: 'You are a concise summarizer. Output only the summary, no preamble.',
    messages: [{ role: 'user', content: summaryPrompt }],
    maxTokens: Math.min(1000, Math.floor(targetTokens * 0.3)),
    temperature: 0,
  });

  const summaryMessage: Message = {
    role: 'assistant',
    content: `[CONVERSATION SUMMARY]\n${response.content}`,
  };

  const result = [summaryMessage, ...preserved];
  const tokensRecovered = currentTokens - result.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  const notice = [
    '[COMPACTION NOTICE]',
    `Summarized ${toSummarize.length} messages into 1 summary block.`,
    `Tokens recovered: ${tokensRecovered.toLocaleString()}`,
    `Preserved verbatim: ${preservedReasons.length} items (${[...new Set(preservedReasons)].join(', ') || 'none'})`,
    'Lost details: intermediate tool output, exploratory debugging trails, superseded approaches',
  ].join('\n');

  return {
    messages: result,
    tokensRecovered,
    summarizedCount: toSummarize.length,
    preservedVerbatim: [...new Set(preservedReasons)],
    notice,
  };
}
