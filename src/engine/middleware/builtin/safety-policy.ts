import { readFileSync, existsSync } from 'fs';
import type { Middleware, MiddlewareContext, MiddlewareResult } from '../types.js';

export interface SafetyRule {
  id: string;
  pattern: string;
  scope?: 'all' | 'file-write' | 'git' | 'bash';
  action: 'block';
  reason: string;
}

const DEFAULT_RULES: SafetyRule[] = [
  { id: 'SAFETY-001', pattern: 'DROP\\s+TABLE', scope: 'all', action: 'block', reason: 'Destructive SQL' },
  { id: 'SAFETY-003', pattern: '--force|force-push', scope: 'git', action: 'block', reason: 'Force push' },
  { id: 'SAFETY-004', pattern: 'rm\\s+-rf\\s+/', scope: 'bash', action: 'block', reason: 'Destructive delete' },
];

const ENTERPRISE_RULES: SafetyRule[] = [
  ...DEFAULT_RULES,
  { id: 'SAFETY-002', pattern: '\\.env|API_KEY|SECRET', scope: 'file-write', action: 'block', reason: 'Secret exposure' },
];

export interface SafetyPolicyOptions {
  configPath?: string;
  tier?: 'default' | 'enterprise';
}

export class SafetyPolicyMiddleware implements Middleware {
  readonly name = 'safety-policy';
  readonly priority = 10;
  readonly removable = false;
  private rules: SafetyRule[];
  private compiledRules: Array<{ rule: SafetyRule; regex: RegExp }>;
  private configPath?: string;
  private tier: 'default' | 'enterprise';

  constructor(optsOrConfigPath?: string | SafetyPolicyOptions) {
    if (typeof optsOrConfigPath === 'string') {
      this.configPath = optsOrConfigPath;
      this.tier = 'default';
    } else {
      this.configPath = optsOrConfigPath?.configPath;
      this.tier = optsOrConfigPath?.tier ?? (process.env.FASTOPS_SAFETY_TIER === 'enterprise' ? 'enterprise' : 'default');
    }
    this.rules = this.loadRules();
    this.compiledRules = this.rules.map((r) => ({
      rule: r,
      regex: new RegExp(r.pattern, 'i'),
    }));
  }

  onRequest(ctx: MiddlewareContext): MiddlewareResult {
    for (const { rule, regex } of this.compiledRules) {
      const contentToCheck = this.getScopedContent(ctx, rule.scope);
      if (contentToCheck && regex.test(contentToCheck)) {
        return {
          action: 'block',
          reason: `[${rule.id}] ${rule.reason}: Pattern '${rule.pattern}' detected in request.`,
        };
      }
    }

    return { action: 'continue' };
  }

  private getScopedContent(ctx: MiddlewareContext, scope?: string): string | null {
    const messages = ctx.request.messages ?? [];
    const parts: string[] = [];

    // Always scan user and assistant text content — dangerous patterns can appear anywhere
    for (const m of messages) {
      if ((m as { role: string }).role === 'system') continue;
      const msg = m as { role: string; content: string; toolCalls?: Array<{ id: string; name: string; arguments: string }> };
      if (msg.content) parts.push(msg.content);
    }

    // For scoped rules, additionally include tool call arguments matching the scope
    if (scope && scope !== 'all') {
      const assistantToolCalls = messages
        .filter((m: { role: string; toolCalls?: unknown[] }) => m.role === 'assistant' && m.toolCalls)
        .flatMap((m: { toolCalls?: Array<{ id: string; name: string; arguments: string }> }) => m.toolCalls ?? []);

      const toolMessages = messages.filter((m: { role: string }) => m.role === 'tool');

      for (const tc of assistantToolCalls) {
        const name = tc.name.toLowerCase();
        const matchesScope =
          (scope === 'file-write' && (name.includes('write') || name.includes('edit') || name.includes('create'))) ||
          (scope === 'git' && (name.includes('git') || name.includes('commit') || name.includes('push'))) ||
          (scope === 'bash' && (name.includes('bash') || name.includes('shell') || name.includes('exec')));

        if (matchesScope) {
          parts.push(tc.arguments);
          const result = toolMessages.find((m: { toolCallId?: string }) => m.toolCallId === tc.id);
          if (result) parts.push((result as { content: string }).content);
        }
      }
    } else {
      // For 'all' scope, include all tool call content
      for (const m of messages) {
        const msg = m as { toolCalls?: Array<{ id: string; name: string; arguments: string }> };
        if (msg.toolCalls) parts.push(JSON.stringify(msg.toolCalls));
      }
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  private loadRules(): SafetyRule[] {
    if (this.configPath && existsSync(this.configPath)) {
      try {
        const raw = readFileSync(this.configPath, 'utf8');
        return JSON.parse(raw);
      } catch {
        return this.tier === 'enterprise' ? ENTERPRISE_RULES : DEFAULT_RULES;
      }
    }
    return this.tier === 'enterprise' ? ENTERPRISE_RULES : DEFAULT_RULES;
  }
}
