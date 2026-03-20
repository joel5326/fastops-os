import type { Middleware, MiddlewareContext, MiddlewareResult } from './types.js';
import type { ChatResponse } from '../types.js';

export class MiddlewareStack {
  private middlewares: Middleware[] = [];

  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
    this.middlewares.sort((a, b) => a.priority - b.priority);
  }

  remove(name: string): boolean {
    const idx = this.middlewares.findIndex((m) => m.name === name);
    if (idx === -1) return false;

    if (!this.middlewares[idx].removable) {
      throw new Error(
        `Cannot remove built-in middleware '${name}'. Safety middleware is non-removable.`,
      );
    }

    this.middlewares.splice(idx, 1);
    return true;
  }

  async executeRequest(ctx: MiddlewareContext): Promise<MiddlewareResult> {
    for (const mw of this.middlewares) {
      if (!mw.onRequest) continue;

      const result = await mw.onRequest(ctx);

      if (result.action === 'block') {
        return result;
      }

      if (result.action === 'modify' && result.request) {
        ctx.request = result.request;
      }
    }

    return { action: 'continue' };
  }

  async executeResponse(ctx: MiddlewareContext, response: ChatResponse): Promise<MiddlewareResult> {
    for (const mw of this.middlewares) {
      if (!mw.onResponse) continue;

      const result = await mw.onResponse(ctx, response);

      if (result.action === 'block') {
        return result;
      }
    }

    return { action: 'continue' };
  }

  list(): Middleware[] {
    return [...this.middlewares];
  }
}
