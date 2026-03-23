import type { Middleware, MiddlewareContext, MiddlewareResult } from '../types.js';

export interface CostLimits {
  perSessionLimit: number;
  perHourLimit: number;
  totalLimit: number;
}

const DEFAULT_LIMITS: CostLimits = {
  perSessionLimit: 5,
  perHourLimit: 20,
  totalLimit: 100,
};

export class CostGateMiddleware implements Middleware {
  readonly name = 'cost-gate';
  readonly priority = 30;
  readonly removable = false;
  private limits: CostLimits;
  private sessionCosts = new Map<string, number>();
  private hourlyCosts: Array<{ ts: number; cost: number }> = [];
  private totalCost = 0;

  constructor(limits?: Partial<CostLimits>) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  getLimits(): CostLimits {
    return { ...this.limits };
  }

  setLimits(patch: Partial<CostLimits>): void {
    this.limits = { ...this.limits, ...patch };
  }

  recordCost(sessionId: string, cost: number): void {
    const current = this.sessionCosts.get(sessionId) ?? 0;
    this.sessionCosts.set(sessionId, current + cost);
    this.hourlyCosts.push({ ts: Date.now(), cost });
    this.totalCost += cost;

    const oneHourAgo = Date.now() - 3600_000;
    this.hourlyCosts = this.hourlyCosts.filter((c) => c.ts > oneHourAgo);
  }

  onRequest(ctx: MiddlewareContext): MiddlewareResult {
    const sessionCost = this.sessionCosts.get(ctx.sessionId) ?? 0;
    if (sessionCost >= this.limits.perSessionLimit) {
      return {
        action: 'block',
        reason: `Session cost limit exceeded: $${sessionCost.toFixed(2)} >= $${this.limits.perSessionLimit} limit.`,
      };
    }

    const oneHourAgo = Date.now() - 3600_000;
    const hourlyCost = this.hourlyCosts
      .filter((c) => c.ts > oneHourAgo)
      .reduce((sum, c) => sum + c.cost, 0);

    if (hourlyCost >= this.limits.perHourLimit) {
      return {
        action: 'block',
        reason: `Hourly cost limit exceeded: $${hourlyCost.toFixed(2)} >= $${this.limits.perHourLimit} limit.`,
      };
    }

    if (this.totalCost >= this.limits.totalLimit) {
      return {
        action: 'block',
        reason: `Total engine cost limit exceeded: $${this.totalCost.toFixed(2)} >= $${this.limits.totalLimit} limit.`,
      };
    }

    return { action: 'continue' };
  }

  getCosts(): { session: Map<string, number>; hourly: number; total: number } {
    const oneHourAgo = Date.now() - 3600_000;
    const hourlyCost = this.hourlyCosts
      .filter((c) => c.ts > oneHourAgo)
      .reduce((sum, c) => sum + c.cost, 0);

    return {
      session: new Map(this.sessionCosts),
      hourly: hourlyCost,
      total: this.totalCost,
    };
  }
}
