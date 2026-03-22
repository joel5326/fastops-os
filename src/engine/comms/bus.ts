import crypto from 'crypto';
import type {
  CommsBus,
  CommsMessage,
  CommsFilter,
  ActionItem,
  ActionItemType,
  Unsubscribe,
} from './types.js';

type SubscriptionHandler = (msg: CommsMessage) => void;

interface Subscription {
  id: string;
  filter: CommsFilter;
  handler: SubscriptionHandler;
}

const ACTION_PATTERNS: Array<{ type: ActionItemType; pattern: RegExp }> = [
  { type: 'REVIEW', pattern: /\bREVIEW\b|QC\s+(REQUIRED|NEEDED|REQUEST)/i },
  { type: 'QUESTION', pattern: /\?\s*$|\bQUESTION\b|\bASKING\b/i },
  { type: 'CALLOUT', pattern: /\bCALLOUT\b|\bATTENTION\b|\bURGENT\b/i },
  { type: 'BLOCKED', pattern: /\bBLOCKED\b|\bBLOCKER\b/i },
  { type: 'CLAIM', pattern: /\bCLAIM(ED|ING)?\b/i },
  { type: 'TAP', pattern: /\bLAST MAN TAP\b|\bTAPPED\b|\bTAP\b.*\bFOR\b/i },
  { type: 'ACK', pattern: /\bACK\b|\bACKNOWLEDGED?\b/i },
];

export class InMemoryCommsBus implements CommsBus {
  private messages: CommsMessage[] = [];
  private subscriptions: Subscription[] = [];
  private readCursors = new Map<string, Map<string, string>>();
  private onPersist?: (msg: CommsMessage) => void;

  constructor(opts?: { onPersist?: (msg: CommsMessage) => void; initialMessages?: CommsMessage[] }) {
    this.onPersist = opts?.onPersist;
    if (opts?.initialMessages) {
      this.messages = [...opts.initialMessages];
    }
  }

  loadHistory(messages: CommsMessage[]): void {
    this.messages = [...messages];
  }

  send(partial: Omit<CommsMessage, 'id' | 'ts'>): CommsMessage {
    const msg: CommsMessage = {
      ...partial,
      id: `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      ts: new Date(),
    };

    this.messages.push(msg);

    if (this.onPersist) {
      this.onPersist(msg);
    }

    for (const sub of this.subscriptions) {
      if (this.matchesFilter(msg, sub.filter)) {
        try {
          sub.handler(msg);
        } catch {
          // subscriber error should not break the bus
        }
      }
    }

    return msg;
  }

  subscribe(filter: CommsFilter, handler: SubscriptionHandler): Unsubscribe {
    const id = crypto.randomBytes(4).toString('hex');
    const sub: Subscription = { id, filter, handler };
    this.subscriptions.push(sub);

    return () => {
      this.subscriptions = this.subscriptions.filter((s) => s.id !== id);
    };
  }

  getHistory(channel: string, opts?: { limit?: number; since?: Date }): CommsMessage[] {
    let results = this.messages.filter((m) => m.channel === channel);

    if (opts?.since) {
      const sinceTime = opts.since.getTime();
      results = results.filter((m) => m.ts.getTime() >= sinceTime);
    }

    if (opts?.limit) {
      results = results.slice(-opts.limit);
    }

    return results;
  }

  getUnread(modelId: string, channel?: string): CommsMessage[] {
    const cursors = this.readCursors.get(modelId);

    return this.messages.filter((msg) => {
      if (msg.from === modelId) return false;
      if (channel && msg.channel !== channel) return false;

      if (!cursors) return true;

      const channelCursor = cursors.get(msg.channel);
      if (!channelCursor) return true;

      const cursorIndex = this.messages.findIndex((m) => m.id === channelCursor);
      const msgIndex = this.messages.findIndex((m) => m.id === msg.id);
      return msgIndex > cursorIndex;
    });
  }

  markRead(modelId: string, upToId: string): void {
    const msg = this.messages.find((m) => m.id === upToId);
    if (!msg) return;

    if (!this.readCursors.has(modelId)) {
      this.readCursors.set(modelId, new Map());
    }

    const cursors = this.readCursors.get(modelId)!;
    const currentCursor = cursors.get(msg.channel);

    if (!currentCursor) {
      cursors.set(msg.channel, upToId);
      return;
    }

    const currentIndex = this.messages.findIndex((m) => m.id === currentCursor);
    const newIndex = this.messages.findIndex((m) => m.id === upToId);
    if (newIndex > currentIndex) {
      cursors.set(msg.channel, upToId);
    }
  }

  getActionItems(modelId: string): ActionItem[] {
    const unread = this.getUnread(modelId);
    const actions: ActionItem[] = [];

    for (const msg of unread) {
      for (const { type, pattern } of ACTION_PATTERNS) {
        if (pattern.test(msg.content)) {
          actions.push({
            type,
            from: msg.from,
            content: msg.content,
            messageId: msg.id,
            ts: msg.ts,
          });
          break;
        }
      }
    }

    return actions;
  }

  listChannels(): string[] {
    const channels = new Set<string>();
    for (const msg of this.messages) {
      channels.add(msg.channel);
    }
    return Array.from(channels);
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  private matchesFilter(msg: CommsMessage, filter: CommsFilter): boolean {
    if (filter.channel && msg.channel !== filter.channel) return false;
    if (filter.from && msg.from !== filter.from) return false;
    if (filter.since && msg.ts.getTime() < filter.since.getTime()) return false;

    if (filter.flags?.length) {
      if (!msg.flags?.length) return false;
      const hasMatch = filter.flags.some((f) => msg.flags!.includes(f));
      if (!hasMatch) return false;
    }

    return true;
  }
}
