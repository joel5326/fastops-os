import type { ChatRequest, ChatResponse } from '../types.js';

export interface MiddlewareContext {
  sessionId: string;
  modelId: string;
  provider: string;
  request: ChatRequest;
  metadata: Record<string, unknown>;
}

export type MiddlewareResult =
  | { action: 'continue' }
  | { action: 'modify'; request?: ChatRequest; response?: ChatResponse }
  | { action: 'block'; reason: string };

export interface Middleware {
  readonly name: string;
  readonly priority: number;
  readonly removable: boolean;
  onRequest?(ctx: MiddlewareContext): MiddlewareResult | Promise<MiddlewareResult>;
  onResponse?(ctx: MiddlewareContext, response: ChatResponse): MiddlewareResult | Promise<MiddlewareResult>;
}
