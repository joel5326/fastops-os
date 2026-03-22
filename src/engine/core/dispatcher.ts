import type { ChatRequest, ChatResponse } from '../types.js';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { ContextManager } from '../context/manager.js';
import type { SessionManager } from './session.js';
import type { ToolExecutor } from '../tools/executor.js';
import type { ToolResult } from '../tools/types.js';
import type { EventBus } from './event-bus.js';
import type { StateStore } from './state-store.js';
import type { MiddlewareStack } from '../middleware/stack.js';
import type { MiddlewareContext } from '../middleware/types.js';

export interface TaskPayload {
  type: 'contract' | 'freeform' | 'qc' | 'review';
  contractId?: string;
  prompt: string;
  model?: string;
  contextOverrides?: {
    kbQuery?: string;
    includeComms?: boolean;
    commsWindow?: number;
  };
}

export interface TaskResult {
  sessionId: string;
  modelId: string;
  response: ChatResponse;
  toolResults: ToolResult[];
  duration: number;
  success: boolean;
  error?: string;
  toolCallCount: number;
}

export interface DispatcherConfig {
  maxToolCalls: number;
  timeoutMs: number;
  workingDirectory: string;
  securityTier?: 'development' | 'enterprise';
  allowElevatedBash?: boolean;
  toolAuditDir?: string;
}

const DEFAULT_CONFIG: DispatcherConfig = {
  maxToolCalls: 25,
  timeoutMs: 10 * 60 * 1000,
  workingDirectory: process.cwd(),
  securityTier: 'development',
  allowElevatedBash: false,
};

export class Dispatcher {
  private registry: AdapterRegistry;
  private contextManager: ContextManager;
  private sessions: SessionManager;
  private tools: ToolExecutor;
  private events: EventBus;
  private stateStore: StateStore;
  private config: DispatcherConfig;
  private middleware?: MiddlewareStack;

  constructor(
    registry: AdapterRegistry,
    contextManager: ContextManager,
    sessions: SessionManager,
    tools: ToolExecutor,
    events: EventBus,
    stateStore: StateStore,
    config?: Partial<DispatcherConfig>,
    middleware?: MiddlewareStack,
  ) {
    this.registry = registry;
    this.contextManager = contextManager;
    this.sessions = sessions;
    this.tools = tools;
    this.events = events;
    this.stateStore = stateStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.middleware = middleware;
  }

  async dispatch(sessionId: string, task: TaskPayload): Promise<TaskResult> {
    const session = this.sessions.getOrThrow(sessionId);

    if (session.status === 'working') {
      throw new Error(`Session ${sessionId} is already working. Cannot dispatch concurrent tasks.`);
    }

    if (this.stateStore.isHalted()) {
      throw new Error('Engine is halted. Kill switch is active.');
    }

    this.sessions.setStatus(sessionId, 'working');
    this.sessions.setTask(sessionId, task.contractId ?? 'freeform');
    this.events.emit('task.dispatched', { sessionId, modelId: session.modelId, task });

    const startTime = Date.now();
    const toolResults: ToolResult[] = [];
    let totalToolCalls = 0;

    try {
      const adapter = this.registry.getOrThrow(session.provider);
      const model = task.model ?? session.model;

      this.sessions.addMessage(sessionId, { role: 'user', content: task.prompt });

      let lastResponse: ChatResponse | undefined;

      while (true) {
        if (Date.now() - startTime > this.config.timeoutMs) {
          throw new Error(`Task timed out after ${this.config.timeoutMs / 1000}s`);
        }

        if (this.stateStore.isHalted()) {
          throw new Error('Engine halted during task execution.');
        }

        const contextPayload = this.contextManager.buildContext(
          {
            modelId: session.modelId,
            provider: session.provider,
            model,
            sessionId,
            currentTask: task.contractId ? {
              id: task.contractId,
              name: task.contractId,
              type: task.type,
              specification: task.prompt,
              acceptanceCriteria: [],
            } : undefined,
            includeComms: task.contextOverrides?.includeComms,
            commsWindow: task.contextOverrides?.commsWindow,
            kbQuery: task.contextOverrides?.kbQuery,
          },
          session.messages,
        );

        const toolDefs = this.tools.getDefinitions(session.modelId);

        const request: ChatRequest = {
          model,
          systemPrompt: contextPayload.systemPrompt,
          messages: session.messages,
          tools: toolDefs.length > 0 ? toolDefs.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })) : undefined,
          maxTokens: 4096,
        };

        if (this.middleware) {
          const mwCtx: MiddlewareContext = {
            sessionId,
            modelId: session.modelId,
            provider: session.provider,
            request,
            metadata: { taskType: task.type, contractId: task.contractId },
          };
          const preResult = await this.middleware.executeRequest(mwCtx);
          if (preResult.action === 'block') {
            throw new Error(`Blocked by middleware: ${preResult.reason}`);
          }
        }

        const response = await adapter.chat(request);
        lastResponse = response;

        if (this.middleware) {
          const mwCtx: MiddlewareContext = {
            sessionId,
            modelId: session.modelId,
            provider: session.provider,
            request,
            metadata: {},
          };
          const postResult = await this.middleware.executeResponse(mwCtx, response);
          if (postResult.action === 'block') {
            throw new Error(`Response blocked by middleware: ${postResult.reason}`);
          }
        }

        this.sessions.addTokens(sessionId, response.usage.inputTokens + response.usage.outputTokens);
        this.sessions.addCost(sessionId, response.usage.cost);
        this.stateStore.addCost(sessionId, response.usage.cost);
        this.contextManager.addCost(response.usage.cost);

        if (response.content) {
          this.sessions.addMessage(sessionId, { role: 'assistant', content: response.content });
        }

        if (!response.toolCalls?.length) {
          break;
        }

        totalToolCalls += response.toolCalls.length;

        if (totalToolCalls > this.config.maxToolCalls) {
          this.events.emit('loop.limit_reached', {
            sessionId,
            modelId: session.modelId,
            toolCallCount: totalToolCalls,
            limit: this.config.maxToolCalls,
          });

          this.sessions.addMessage(sessionId, {
            role: 'user',
            content: `[SYSTEM] Tool call limit reached (${this.config.maxToolCalls}). Please provide your final response without further tool calls.`,
          });
          continue;
        }

        for (const toolCall of response.toolCalls) {
          this.sessions.incrementToolCalls(sessionId);
          this.events.emit('tool.executed', {
            sessionId,
            modelId: session.modelId,
            tool: toolCall.name,
          });

          const result = await this.tools.execute(
            { id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments },
            {
              sessionId,
              modelId: session.modelId,
              workingDirectory: this.config.workingDirectory,
              sandboxRoot: this.config.workingDirectory,
              securityTier: this.config.securityTier ?? 'development',
              allowElevatedBash: this.config.allowElevatedBash ?? false,
              toolAuditDir: this.config.toolAuditDir,
            },
          );

          toolResults.push(result);

          this.sessions.addMessage(sessionId, {
            role: 'tool',
            content: result.output,
            toolCallId: toolCall.id,
            name: toolCall.name,
          });
        }
      }

      const duration = Date.now() - startTime;

      this.sessions.setStatus(sessionId, 'idle');
      this.sessions.setTask(sessionId, undefined);

      const taskResult: TaskResult = {
        sessionId,
        modelId: session.modelId,
        response: lastResponse!,
        toolResults,
        duration,
        success: true,
        toolCallCount: totalToolCalls,
      };

      this.events.emit('task.completed', taskResult);
      return taskResult;
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      this.sessions.setStatus(sessionId, 'error');
      this.sessions.setTask(sessionId, undefined);

      const taskResult: TaskResult = {
        sessionId,
        modelId: session.modelId,
        response: {
          content: `Error: ${errorMsg}`,
          usage: { inputTokens: 0, outputTokens: 0, cost: 0 },
          model: session.model,
          provider: session.provider,
          latencyMs: duration,
        },
        toolResults,
        duration,
        success: false,
        error: errorMsg,
        toolCallCount: totalToolCalls,
      };

      this.events.emit('task.failed', taskResult);
      return taskResult;
    }
  }

  async dispatchParallel(
    tasks: Array<{ sessionId: string; task: TaskPayload }>,
  ): Promise<TaskResult[]> {
    const promises = tasks.map(({ sessionId, task }) => this.dispatch(sessionId, task));
    const results = await Promise.allSettled(promises);

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        sessionId: tasks[i].sessionId,
        modelId: 'unknown',
        response: {
          content: `Error: ${r.reason}`,
          usage: { inputTokens: 0, outputTokens: 0, cost: 0 },
          model: 'unknown',
          provider: 'unknown',
          latencyMs: 0,
        },
        toolResults: [],
        duration: 0,
        success: false,
        error: String(r.reason),
        toolCallCount: 0,
      };
    });
  }
}
