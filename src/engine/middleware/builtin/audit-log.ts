import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Middleware, MiddlewareContext, MiddlewareResult } from '../types.js';
import type { ChatResponse } from '../../types.js';

export class AuditLogMiddleware implements Middleware {
  readonly name = 'audit-log';
  readonly priority = 100;
  readonly removable = false;
  private logDir: string;

  constructor(logDir: string) {
    this.logDir = logDir;
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  onRequest(ctx: MiddlewareContext): MiddlewareResult {
    this.appendLog({
      type: 'request',
      ts: new Date().toISOString(),
      sessionId: ctx.sessionId,
      modelId: ctx.modelId,
      provider: ctx.provider,
      messageCount: ctx.request.messages.length,
      systemPromptLength: ctx.request.systemPrompt.length,
      toolCount: ctx.request.tools?.length ?? 0,
    });

    return { action: 'continue' };
  }

  onResponse(ctx: MiddlewareContext, response: ChatResponse): MiddlewareResult {
    this.appendLog({
      type: 'response',
      ts: new Date().toISOString(),
      sessionId: ctx.sessionId,
      modelId: ctx.modelId,
      provider: ctx.provider,
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cost: response.usage.cost,
      latencyMs: response.latencyMs,
      toolCallCount: response.toolCalls?.length ?? 0,
      contentLength: response.content.length,
    });

    return { action: 'continue' };
  }

  private appendLog(entry: Record<string, unknown>): void {
    const dateStr = new Date().toISOString().split('T')[0];
    const logFile = join(this.logDir, `audit-${dateStr}.jsonl`);
    appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  }
}
