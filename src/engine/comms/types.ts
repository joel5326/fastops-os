export interface CommsMessage {
  id: string;
  from: string;
  channel: string;
  content: string;
  ts: Date;
  flags?: CommsFlag[];
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export type CommsFlag = 'urgent' | 'blocker' | 'qc-request' | 'claim' | 'status' | 'tap';

export interface CommsFilter {
  channel?: string;
  from?: string;
  flags?: CommsFlag[];
  since?: Date;
}

export type ActionItemType = 'REVIEW' | 'QUESTION' | 'CALLOUT' | 'BLOCKED' | 'CLAIM' | 'TAP' | 'ACK';

export interface ActionItem {
  type: ActionItemType;
  from: string;
  content: string;
  messageId: string;
  ts: Date;
}

export type Unsubscribe = () => void;

export interface CommsBus {
  send(msg: Omit<CommsMessage, 'id' | 'ts'>): CommsMessage;
  subscribe(filter: CommsFilter, handler: (msg: CommsMessage) => void): Unsubscribe;
  getHistory(channel: string, opts?: { limit?: number; since?: Date }): CommsMessage[];
  getUnread(modelId: string, channel?: string): CommsMessage[];
  markRead(modelId: string, upToId: string): void;
  getActionItems(modelId: string): ActionItem[];
  listChannels(): string[];
}
