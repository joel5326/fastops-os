import { estimateTokens } from '../token-counter.js';

export interface CommsMessage {
  id: string;
  from: string;
  content: string;
  channel: string;
  ts: string;
  urgent?: boolean;
}

export interface CommsContext {
  text: string;
  tokens: number;
  includedCount: number;
  urgentCount: number;
}

export function buildCommsLayer(
  messages: CommsMessage[],
  windowSize: number = 20,
  maxTokens?: number,
): CommsContext {
  if (messages.length === 0) {
    return { text: '', tokens: 0, includedCount: 0, urgentCount: 0 };
  }

  const urgent = messages.filter((m) => m.urgent);
  const recent = messages
    .filter((m) => !m.urgent)
    .slice(-windowSize);

  const included = [...urgent, ...recent];
  included.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  const parts: string[] = ['[RECENT COMMS]'];

  for (const msg of included) {
    const prefix = msg.urgent ? '[URGENT] ' : '';
    const time = new Date(msg.ts).toLocaleTimeString('en-US', { hour12: false });
    parts.push(`[${time}] ${prefix}${msg.from} (#${msg.channel}): ${msg.content}`);
  }

  let text = parts.join('\n');

  if (maxTokens && estimateTokens(text) > maxTokens) {
    const lines = text.split('\n');
    while (lines.length > 2 && estimateTokens(lines.join('\n')) > maxTokens) {
      const isUrgent = lines[1]?.includes('[URGENT]');
      if (!isUrgent) {
        lines.splice(1, 1);
      } else {
        break;
      }
    }
    text = lines.join('\n');
  }

  return {
    text,
    tokens: estimateTokens(text),
    includedCount: included.length,
    urgentCount: urgent.length,
  };
}
