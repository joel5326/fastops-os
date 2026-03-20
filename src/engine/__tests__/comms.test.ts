import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryCommsBus } from '../comms/bus.js';
import { formatMessage, detectFlags, isCommsOutput, extractCommsContent } from '../comms/formatter.js';
import type { CommsMessage } from '../comms/types.js';

describe('InMemoryCommsBus', () => {
  let bus: InMemoryCommsBus;

  beforeEach(() => {
    bus = new InMemoryCommsBus();
  });

  it('send() creates message with id and timestamp', () => {
    const msg = bus.send({ from: 'claude', channel: 'general', content: 'FOS-02 complete' });
    expect(msg.id).toBeTruthy();
    expect(msg.ts).toBeInstanceOf(Date);
    expect(msg.from).toBe('claude');
    expect(msg.content).toBe('FOS-02 complete');
  });

  it('subscribe() receives messages matching filter', () => {
    const received: CommsMessage[] = [];
    bus.subscribe({ channel: 'general' }, (msg) => received.push(msg));

    bus.send({ from: 'claude', channel: 'general', content: 'hello' });
    bus.send({ from: 'gpt', channel: 'ops', content: 'different channel' });
    bus.send({ from: 'kimi', channel: 'general', content: 'world' });

    expect(received).toHaveLength(2);
    expect(received[0].from).toBe('claude');
    expect(received[1].from).toBe('kimi');
  });

  it('subscribe() filters by from', () => {
    const received: CommsMessage[] = [];
    bus.subscribe({ from: 'gpt' }, (msg) => received.push(msg));

    bus.send({ from: 'claude', channel: 'general', content: 'not gpt' });
    bus.send({ from: 'gpt', channel: 'general', content: 'is gpt' });

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe('is gpt');
  });

  it('subscribe() filters by flags', () => {
    const received: CommsMessage[] = [];
    bus.subscribe({ flags: ['urgent'] }, (msg) => received.push(msg));

    bus.send({ from: 'claude', channel: 'general', content: 'normal' });
    bus.send({ from: 'joel', channel: 'general', content: 'URGENT', flags: ['urgent'] });

    expect(received).toHaveLength(1);
    expect(received[0].flags).toContain('urgent');
  });

  it('unsubscribe works', () => {
    const received: CommsMessage[] = [];
    const unsub = bus.subscribe({}, (msg) => received.push(msg));

    bus.send({ from: 'claude', channel: 'general', content: 'before' });
    unsub();
    bus.send({ from: 'claude', channel: 'general', content: 'after' });

    expect(received).toHaveLength(1);
  });

  it('getHistory returns channel messages', () => {
    bus.send({ from: 'claude', channel: 'general', content: 'msg1' });
    bus.send({ from: 'gpt', channel: 'ops', content: 'msg2' });
    bus.send({ from: 'kimi', channel: 'general', content: 'msg3' });

    const history = bus.getHistory('general');
    expect(history).toHaveLength(2);
  });

  it('getHistory respects limit', () => {
    for (let i = 0; i < 10; i++) {
      bus.send({ from: 'claude', channel: 'general', content: `msg${i}` });
    }

    const history = bus.getHistory('general', { limit: 3 });
    expect(history).toHaveLength(3);
    expect(history[0].content).toBe('msg7');
  });

  it('getUnread returns messages not yet read by model', () => {
    const m1 = bus.send({ from: 'claude', channel: 'general', content: 'msg1' });
    const m2 = bus.send({ from: 'gpt', channel: 'general', content: 'msg2' });

    const unreadBefore = bus.getUnread('kimi');
    expect(unreadBefore).toHaveLength(2);

    bus.markRead('kimi', m1.id);

    const unreadAfter = bus.getUnread('kimi');
    expect(unreadAfter).toHaveLength(1);
    expect(unreadAfter[0].content).toBe('msg2');
  });

  it('getUnread excludes own messages', () => {
    bus.send({ from: 'claude', channel: 'general', content: 'my own message' });
    bus.send({ from: 'gpt', channel: 'general', content: 'from gpt' });

    const unread = bus.getUnread('claude');
    expect(unread).toHaveLength(1);
    expect(unread[0].from).toBe('gpt');
  });

  it('getActionItems extracts action patterns', () => {
    bus.send({ from: 'claude', channel: 'general', content: 'FOS-02 BUILD COMPLETE. QC REQUIRED. Over.' });
    bus.send({ from: 'gpt', channel: 'general', content: 'Normal status update.' });
    bus.send({ from: 'kimi', channel: 'general', content: 'BLOCKED on FOS-03 dependency.' });

    const actions = bus.getActionItems('gemini');
    expect(actions.length).toBeGreaterThanOrEqual(2);

    const types = actions.map((a) => a.type);
    expect(types).toContain('REVIEW');
    expect(types).toContain('BLOCKED');
  });

  it('listChannels returns all unique channels', () => {
    bus.send({ from: 'claude', channel: 'general', content: 'a' });
    bus.send({ from: 'gpt', channel: 'ops', content: 'b' });
    bus.send({ from: 'kimi', channel: 'general', content: 'c' });

    const channels = bus.listChannels();
    expect(channels).toContain('general');
    expect(channels).toContain('ops');
    expect(channels).toHaveLength(2);
  });

  it('onPersist callback fires on every send', () => {
    const persisted: CommsMessage[] = [];
    const bus2 = new InMemoryCommsBus({ onPersist: (msg) => persisted.push(msg) });

    bus2.send({ from: 'claude', channel: 'general', content: 'test' });
    bus2.send({ from: 'gpt', channel: 'general', content: 'test2' });

    expect(persisted).toHaveLength(2);
  });
});

describe('Formatter', () => {
  it('formatMessage includes time, from, channel, content', () => {
    const msg: CommsMessage = {
      id: '1',
      from: 'claude',
      channel: 'general',
      content: 'FOS-02 complete',
      ts: new Date('2026-03-20T15:00:00Z'),
    };

    const formatted = formatMessage(msg);
    expect(formatted).toContain('claude');
    expect(formatted).toContain('#general');
    expect(formatted).toContain('FOS-02 complete');
  });

  it('formatMessage shows [URGENT] prefix for urgent messages', () => {
    const msg: CommsMessage = {
      id: '1',
      from: 'joel',
      channel: 'general',
      content: 'Stop all work',
      ts: new Date(),
      flags: ['urgent'],
    };

    expect(formatMessage(msg)).toContain('[URGENT]');
  });

  it('detectFlags identifies urgent messages', () => {
    expect(detectFlags('URGENT: deploy now')).toContain('urgent');
    expect(detectFlags('CRITICAL issue found')).toContain('urgent');
    expect(detectFlags('normal message')).not.toContain('urgent');
  });

  it('detectFlags identifies QC requests', () => {
    expect(detectFlags('FOS-02 complete. QC REQUIRED.')).toContain('qc-request');
  });

  it('detectFlags identifies Last Man Taps', () => {
    expect(detectFlags('LAST MAN TAP — GPT tapped for FOS-06')).toContain('tap');
  });

  it('isCommsOutput detects model comms output', () => {
    expect(isCommsOutput('COMMANDER CLAUDE — FOS-02 build complete. Over.')).toBe(true);
    expect(isCommsOutput('STATUS UPDATE: all tests pass. Over.')).toBe(true);
    expect(isCommsOutput('Just a normal response about code.')).toBe(false);
  });

  it('extractCommsContent extracts comms block from model output', () => {
    const output = 'Here is some code.\n\nCOMMANDER CLAUDE — Build complete. All tests pass. Over.\n\nMore text.';
    const extracted = extractCommsContent(output);
    expect(extracted).toContain('COMMANDER CLAUDE');
    expect(extracted).toContain('Over.');
  });
});
