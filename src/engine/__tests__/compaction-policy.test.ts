import { describe, it, expect } from 'vitest';
import type { ModelAdapter, ChatRequest, ChatChunk, Message } from '../types.js';
import {
  normalizeCompactionPolicy,
  shouldPreserveVerbatim,
} from '../context/compaction-policy.js';
import { summarizeMessages } from '../context/summarizer.js';
import { ContextManager } from '../context/manager.js';
import { join } from 'path';

class FakeAdapter implements ModelAdapter {
  readonly provider = 'fake';
  readonly models = ['fake-model'];

  async chat(_request: ChatRequest) {
    return {
      content: 'Condensed summary with decisions preserved.',
      usage: { inputTokens: 10, outputTokens: 10, cost: 0 },
      model: 'fake-model',
      provider: 'fake',
      latencyMs: 1,
    };
  }

  async *chatStream(_request: ChatRequest): AsyncIterable<ChatChunk> {
    yield { delta: '', done: true };
  }

  async ping() {
    return true;
  }
}

describe('CompactionPolicy', () => {
  it('rejects invalid threshold ordering', () => {
    expect(() =>
      normalizeCompactionPolicy({
        checkpointThreshold: 80,
        summarizeThreshold: 60,
      }),
    ).toThrow('thresholds must be ordered');
  });

  it('preserves decisions/code and drops intermediate tool output', () => {
    const decision = shouldPreserveVerbatim(
      { role: 'assistant', content: 'Decision: we will ship contract FOS-09.' },
      0,
      20,
    );
    const code = shouldPreserveVerbatim(
      { role: 'assistant', content: '```ts\nconst x = 1;\n```' },
      0,
      20,
    );
    const tool = shouldPreserveVerbatim(
      { role: 'tool', content: 'npm install output...' },
      0,
      20,
    );

    expect(decision.preserve).toBe(true);
    expect(code.preserve).toBe(true);
    expect(tool.preserve).toBe(false);
  });
});

describe('Summarizer policy behavior', () => {
  it('drops intermediate tool outputs from preserved set', async () => {
    const adapter = new FakeAdapter();
    const messages: Message[] = [
      { role: 'tool', content: 'old tool output: ls -la' },
      { role: 'assistant', content: 'Decision: adopt phase-4 compaction policy.' },
      { role: 'user', content: 'Debugging note that can be summarized.' },
      { role: 'tool', content: 'recent tool output still drops under policy' },
      { role: 'assistant', content: 'recent plain message may stay verbatim' },
    ];

    const result = await summarizeMessages(messages, 5, adapter, 'fake-model');
    const preservedToolMessages = result.messages.filter((m) => m.role === 'tool');

    expect(preservedToolMessages.length).toBe(0);
    expect(result.notice).toContain('Lost details: intermediate tool output');
  });
});

describe('ContextManager policy thresholds', () => {
  it('honors custom hard-stop threshold', async () => {
    const promptsDir = join(__dirname, '..', 'context', 'prompts');
    const cm = new ContextManager(promptsDir);
    cm.setCompactionPolicy({
      checkpointThreshold: 60,
      summarizeThreshold: 80,
      handoffThreshold: 80,
      hardStopThreshold: 90,
    });

    const large = 'x'.repeat(740_000); // ~185k tokens on 4-char approximation
    const history: Message[] = [{ role: 'user', content: large }];
    const event = await cm.checkCompactionThresholds(history, 'claude-sonnet-4-20250514');

    expect(event).not.toBeNull();
    expect(event?.action).toBe('HARD_STOP');
    expect(event?.threshold).toBe(90);
  });
});
