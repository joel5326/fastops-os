import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MiddlewareStack } from '../middleware/stack.js';
import { HaltCheckMiddleware } from '../middleware/builtin/halt-check.js';
import { SafetyPolicyMiddleware } from '../middleware/builtin/safety-policy.js';
import { CostGateMiddleware } from '../middleware/builtin/cost-gate.js';
import { AuditLogMiddleware } from '../middleware/builtin/audit-log.js';
import type { MiddlewareContext } from '../middleware/types.js';
import { writeFileSync, mkdirSync, existsSync, rmSync, unlinkSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), '.test-middleware');

function makeContext(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
  return {
    sessionId: 'test-session',
    modelId: 'claude',
    provider: 'anthropic',
    request: {
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'You are a test assistant.',
      messages: [{ role: 'user', content: 'hello' }],
    },
    metadata: {},
    ...overrides,
  };
}

describe('MiddlewareStack', () => {
  it('executes middleware in priority order', async () => {
    const stack = new MiddlewareStack();
    const order: string[] = [];

    stack.use({
      name: 'second', priority: 20, removable: true,
      onRequest: () => { order.push('second'); return { action: 'continue' }; },
    });
    stack.use({
      name: 'first', priority: 10, removable: true,
      onRequest: () => { order.push('first'); return { action: 'continue' }; },
    });

    await stack.executeRequest(makeContext());
    expect(order).toEqual(['first', 'second']);
  });

  it('blocks on first blocking middleware', async () => {
    const stack = new MiddlewareStack();
    let secondRan = false;

    stack.use({
      name: 'blocker', priority: 10, removable: true,
      onRequest: () => ({ action: 'block', reason: 'blocked' }),
    });
    stack.use({
      name: 'second', priority: 20, removable: true,
      onRequest: () => { secondRan = true; return { action: 'continue' }; },
    });

    const result = await stack.executeRequest(makeContext());
    expect(result.action).toBe('block');
    expect(secondRan).toBe(false);
  });

  it('prevents removal of non-removable middleware', () => {
    const stack = new MiddlewareStack();
    stack.use({ name: 'safety', priority: 10, removable: false });

    expect(() => stack.remove('safety')).toThrow('Cannot remove');
  });

  it('allows removal of removable middleware', () => {
    const stack = new MiddlewareStack();
    stack.use({ name: 'custom', priority: 50, removable: true });

    expect(stack.remove('custom')).toBe(true);
    expect(stack.list()).toHaveLength(0);
  });
});

describe('HaltCheckMiddleware', () => {
  beforeEach(() => {
    if (!existsSync(join(TEST_DIR, '.fastops'))) {
      mkdirSync(join(TEST_DIR, '.fastops'), { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('allows requests when halt file does not exist', () => {
    const mw = new HaltCheckMiddleware(TEST_DIR);
    const result = mw.onRequest(makeContext());
    expect(result.action).toBe('continue');
  });

  it('blocks all requests when halt file exists', () => {
    writeFileSync(join(TEST_DIR, '.fastops', '.halt'), 'halted', 'utf8');
    const mw = new HaltCheckMiddleware(TEST_DIR);
    const result = mw.onRequest(makeContext());
    expect(result.action).toBe('block');
  });
});

describe('SafetyPolicyMiddleware', () => {
  it('blocks destructive SQL', () => {
    const mw = new SafetyPolicyMiddleware();
    const ctx = makeContext({
      request: {
        model: 'test',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'DROP TABLE users' }],
      },
    });

    const result = mw.onRequest(ctx);
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.reason).toContain('SAFETY-001');
    }
  });

  it('blocks force push', () => {
    const mw = new SafetyPolicyMiddleware();
    const ctx = makeContext({
      request: {
        model: 'test',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'git push --force origin main' }],
      },
    });

    const result = mw.onRequest(ctx);
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.reason).toContain('SAFETY-003');
    }
  });

  it('blocks rm -rf /', () => {
    const mw = new SafetyPolicyMiddleware();
    const ctx = makeContext({
      request: {
        model: 'test',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'rm -rf /' }],
      },
    });

    const result = mw.onRequest(ctx);
    expect(result.action).toBe('block');
  });

  it('allows safe requests', () => {
    const mw = new SafetyPolicyMiddleware();
    const result = mw.onRequest(makeContext());
    expect(result.action).toBe('continue');
  });

  it('blocks secret exposure in enterprise tier', () => {
    const mw = new SafetyPolicyMiddleware({ tier: 'enterprise' });
    const ctx = makeContext({
      request: {
        model: 'test',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'write my .env file with API_KEY=abc123' }],
      },
    });

    const result = mw.onRequest(ctx);
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.reason).toContain('SAFETY-002');
    }
  });

  it('allows secret references in default tier', () => {
    const mw = new SafetyPolicyMiddleware();
    const ctx = makeContext({
      request: {
        model: 'test',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'write my .env file with API_KEY=abc123' }],
      },
    });

    const result = mw.onRequest(ctx);
    expect(result.action).toBe('continue');
  });

  it('blocks scoped patterns in tool call arguments', () => {
    const mw = new SafetyPolicyMiddleware({ tier: 'enterprise' });
    const ctx = makeContext({
      request: {
        model: 'test',
        systemPrompt: '',
        messages: [
          { role: 'user', content: 'save my config' },
          {
            role: 'assistant',
            content: 'Writing file now.',
            toolCalls: [{ id: 'tc-1', name: 'write_file', arguments: '{"path":".env","content":"SECRET=xyz"}' }],
          },
        ],
      },
    });

    const result = mw.onRequest(ctx);
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.reason).toContain('SAFETY-002');
    }
  });
});

describe('CostGateMiddleware', () => {
  it('allows requests under budget', () => {
    const mw = new CostGateMiddleware({ perSessionLimit: 5 });
    const result = mw.onRequest(makeContext());
    expect(result.action).toBe('continue');
  });

  it('blocks when session cost exceeds limit', () => {
    const mw = new CostGateMiddleware({ perSessionLimit: 1 });
    mw.recordCost('test-session', 1.50);

    const result = mw.onRequest(makeContext());
    expect(result.action).toBe('block');
  });

  it('blocks when total cost exceeds limit', () => {
    const mw = new CostGateMiddleware({ totalLimit: 2 });
    mw.recordCost('s1', 1.0);
    mw.recordCost('s2', 1.5);

    const result = mw.onRequest(makeContext());
    expect(result.action).toBe('block');
  });

  it('tracks costs correctly', () => {
    const mw = new CostGateMiddleware();
    mw.recordCost('s1', 0.50);
    mw.recordCost('s1', 0.25);
    mw.recordCost('s2', 1.00);

    const costs = mw.getCosts();
    expect(costs.session.get('s1')).toBeCloseTo(0.75);
    expect(costs.session.get('s2')).toBeCloseTo(1.00);
    expect(costs.total).toBeCloseTo(1.75);
  });
});

describe('AuditLogMiddleware', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('logs request and continues', () => {
    const mw = new AuditLogMiddleware(TEST_DIR);
    const result = mw.onRequest(makeContext());
    expect(result.action).toBe('continue');
  });

  it('logs response and continues', () => {
    const mw = new AuditLogMiddleware(TEST_DIR);
    const result = mw.onResponse(makeContext(), {
      content: 'test response',
      usage: { inputTokens: 100, outputTokens: 50, cost: 0.001 },
      model: 'test',
      provider: 'test',
      latencyMs: 500,
    });
    expect(result.action).toBe('continue');
  });
});
