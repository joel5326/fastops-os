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
  { id: 'SAFETY-002', pattern: '\\.env|API_KEY|SECRET', scope: 'file-write', action: 'block', reason: 'Secret exposure' },
  { id: 'SAFETY-003', pattern: '--force|force-push', scope: 'git', action: 'block', reason: 'Force push' },
  { id: 'SAFETY-004', pattern: 'rm\\s+-rf\\s+/', scope: 'bash', action: 'block', reason: 'Destructive delete' },
];

export class SafetyPolicyMiddleware implements Middleware {
  readonly name = 'safety-policy';
  readonly priority = 10;
  readonly removable = false;
  private rules: SafetyRule[];
  private compiledRules: Array<{ rule: SafetyRule; regex: RegExp }>;
  private configPath?: string;

  constructor(configPath?: string) {
    this.configPath = configPath;
    this.rules = this.loadRules();
    this.compiledRules = this.rules.map((r) => ({
      rule: r,
      regex: new RegExp(r.pattern, 'i'),
    }));
  }

  onRequest(ctx: MiddlewareContext): MiddlewareResult {
    const content = JSON.stringify(ctx.request);

    for (const { rule, regex } of this.compiledRules) {
      if (regex.test(content)) {
        return {
          action: 'block',
          reason: `[${rule.id}] ${rule.reason}: Pattern '${rule.pattern}' detected in request.`,
        };
      }
    }

    return { action: 'continue' };
  }

  private loadRules(): SafetyRule[] {
    if (this.configPath && existsSync(this.configPath)) {
      try {
        const raw = readFileSync(this.configPath, 'utf8');
        return JSON.parse(raw);
      } catch {
        return DEFAULT_RULES;
      }
    }
    return DEFAULT_RULES;
  }
}
