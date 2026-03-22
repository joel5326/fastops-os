import { join } from 'path';
import type { FastOpsConfig } from '../../config.js';
import { AdapterRegistry } from '../adapters/registry.js';
import { ContextManager } from '../context/manager.js';
import { InMemoryCommsBus } from '../comms/bus.js';
import { DailyRotatingExporter } from '../comms/export.js';
import { EventBus } from './event-bus.js';
import { StateStore } from './state-store.js';
import { SessionManager } from './session.js';
import type { SessionOpts, Session } from './session.js';
import { Dispatcher, type TaskPayload, type TaskResult, type DispatcherConfig } from './dispatcher.js';
import { ToolExecutor } from '../tools/executor.js';
import { readFile, writeFile, editFile } from '../tools/file-ops.js';
import { glob, grep } from '../tools/search-ops.js';
import { bash } from '../tools/bash.js';
import type { ToolDefinition } from '../tools/types.js';
import { MiddlewareStack } from '../middleware/stack.js';
import { HaltCheckMiddleware } from '../middleware/builtin/halt-check.js';
import { SafetyPolicyMiddleware } from '../middleware/builtin/safety-policy.js';
import { CostGateMiddleware } from '../middleware/builtin/cost-gate.js';
import { AuditLogMiddleware } from '../middleware/builtin/audit-log.js';
import { ContractEngine } from '../contracts/engine.js';
import type { Contract, ClaimResult } from '../contracts/types.js';

export interface EngineOptions {
  workingDirectory?: string;
  stateFilePath?: string;
  promptsDir?: string;
  commsExportDir?: string;
  contractsStatePath?: string;
  dispatcherConfig?: Partial<DispatcherConfig>;
  toolPermissions?: Record<string, string[]>;
}

export class FastOpsEngine {
  readonly events: EventBus;
  readonly comms: InMemoryCommsBus;
  readonly stateStore: StateStore;
  readonly sessions: SessionManager;
  readonly contextManager: ContextManager;
  readonly dispatcher: Dispatcher;
  readonly tools: ToolExecutor;
  readonly middleware: MiddlewareStack;
  readonly costGate: CostGateMiddleware;
  readonly contracts: ContractEngine;

  private registry: AdapterRegistry;
  readonly securityTier: string;
  private running = false;
  private workingDirectory: string;

  constructor(config: FastOpsConfig, opts?: EngineOptions) {
    this.securityTier = config.securityTier;
    this.workingDirectory = opts?.workingDirectory ?? process.cwd();

    this.events = new EventBus();

    const stateFile = opts?.stateFilePath ?? join(this.workingDirectory, '.fastops-engine', 'state.json');
    this.stateStore = new StateStore(stateFile);

    const commsExportDir = opts?.commsExportDir ?? join(this.workingDirectory, '.fastops-engine', 'comms');
    const exporter = new DailyRotatingExporter(commsExportDir);
    this.comms = new InMemoryCommsBus({
      onPersist: (msg) => exporter.append(msg),
    });

    const promptsDir = opts?.promptsDir ?? join(this.workingDirectory, 'src', 'engine', 'context', 'prompts');
    this.contextManager = new ContextManager(promptsDir);

    this.sessions = new SessionManager();

    this.tools = new ToolExecutor();
    this.registerBuiltInTools();

    if (opts?.toolPermissions) {
      for (const [modelId, tools] of Object.entries(opts.toolPermissions)) {
        this.tools.setPermissions(modelId, tools);
      }
    }

    const contractsStatePath = opts?.contractsStatePath ?? join(this.workingDirectory, '.fastops-engine', 'contracts.json');
    this.contracts = new ContractEngine(contractsStatePath);

    this.registry = new AdapterRegistry(config);

    this.middleware = new MiddlewareStack();
    this.middleware.use(new HaltCheckMiddleware(this.workingDirectory));
    this.middleware.use(new SafetyPolicyMiddleware());
    this.costGate = new CostGateMiddleware();
    this.middleware.use(this.costGate);
    const auditDir = join(this.workingDirectory, '.fastops-engine', 'audit');
    this.middleware.use(new AuditLogMiddleware(auditDir));

    this.dispatcher = new Dispatcher(
      this.registry,
      this.contextManager,
      this.sessions,
      this.tools,
      this.events,
      this.stateStore,
      { ...opts?.dispatcherConfig, workingDirectory: this.workingDirectory },
      this.middleware,
    );
  }

  async start(): Promise<void> {
    if (this.running) throw new Error('Engine is already running.');

    await this.registry.initialize();

    const available = this.registry.listAvailable();
    const models = available.map((name) => ({
      modelId: name,
      provider: name,
      status: 'online' as const,
    }));
    this.stateStore.update({ models });

    this.events.on('task.completed', (...args: unknown[]) => {
      const result = args[0] as { sessionId?: string; response?: { usage?: { cost?: number } } } | undefined;
      if (result?.sessionId && result.response?.usage?.cost) {
        this.costGate.recordCost(String(result.sessionId), result.response.usage.cost);
      }
    });

    this.running = true;
    this.events.emit('engine.started', {
      adapters: available,
      middleware: this.middleware.list().map((m) => m.name),
    });

    console.log(`[FastOps Engine] Started with ${available.length} adapter(s): ${available.join(', ')}`);
    console.log(`[FastOps Engine] Middleware stack: ${this.middleware.list().map((m) => m.name).join(' → ')}`);
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    this.stateStore.persistNow();
    this.stateStore.destroy();
    this.running = false;
    this.events.emit('engine.stopped', {});

    console.log('[FastOps Engine] Stopped.');
  }

  isRunning(): boolean {
    return this.running;
  }

  createSession(modelId: string, opts?: Partial<SessionOpts>): Session {
    const adapter = this.registry.getOrThrow(modelId);
    const session = this.sessions.create(modelId, {
      provider: modelId,
      model: opts?.model ?? adapter.models[0],
      maxMessages: opts?.maxMessages,
    });

    this.events.emit('session.created', { sessionId: session.id, modelId });
    return session;
  }

  async dispatch(sessionId: string, task: TaskPayload): Promise<TaskResult> {
    return this.dispatcher.dispatch(sessionId, task);
  }

  async dispatchParallel(tasks: Array<{ sessionId: string; task: TaskPayload }>): Promise<TaskResult[]> {
    return this.dispatcher.dispatchParallel(tasks);
  }

  loadContracts(contracts: Contract[]): void {
    this.contracts.loadContracts(contracts);
    this.events.emit('contracts.loaded', { count: contracts.length });
  }

  claimContract(contractId: string, modelId: string): ClaimResult {
    const result = this.contracts.claim(contractId, modelId);
    if (result.success) {
      this.events.emit('contract.claimed', { contractId, modelId });
    }
    return result;
  }

  private registerBuiltInTools(): void {
    const tools: Array<{ def: ToolDefinition; handler: typeof readFile }> = [
      {
        def: {
          name: 'read_file',
          description: 'Read a file from disk. Returns numbered lines.',
          parameters: { type: 'object', properties: { path: { type: 'string' }, startLine: { type: 'number' }, endLine: { type: 'number' } }, required: ['path'] },
        },
        handler: readFile,
      },
      {
        def: {
          name: 'write_file',
          description: 'Create or overwrite a file on disk.',
          parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
        },
        handler: writeFile,
      },
      {
        def: {
          name: 'edit_file',
          description: 'Replace a string in a file. Returns error with suggestions if old_string not found.',
          parameters: { type: 'object', properties: { path: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' }, replaceAll: { type: 'boolean' } }, required: ['path', 'oldString', 'newString'] },
        },
        handler: editFile,
      },
      {
        def: {
          name: 'glob',
          description: 'Find files matching a glob pattern.',
          parameters: { type: 'object', properties: { pattern: { type: 'string' }, cwd: { type: 'string' } }, required: ['pattern'] },
        },
        handler: glob,
      },
      {
        def: {
          name: 'grep',
          description: 'Search file contents with regex.',
          parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' }, includes: { type: 'array', items: { type: 'string' } } }, required: ['pattern'] },
        },
        handler: grep,
      },
      {
        def: {
          name: 'bash',
          description: 'Run a shell command. Returns stdout/stderr.',
          parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' }, timeout: { type: 'number', description: 'Timeout in seconds' } }, required: ['command'] },
        },
        handler: bash,
      },
    ];

    for (const { def, handler } of tools) {
      this.tools.register(def, handler);
    }

    this.tools.register(
      {
        name: 'comms_send',
        description: 'Send a message to comms.',
        parameters: { type: 'object', properties: { channel: { type: 'string' }, content: { type: 'string' } }, required: ['channel', 'content'] },
      },
      async (args, ctx) => {
        const msg = this.comms.send({
          from: ctx.modelId,
          channel: String(args.channel),
          content: String(args.content),
        });
        return `Message sent: ${msg.id}`;
      },
    );

    this.tools.register(
      {
        name: 'comms_read',
        description: 'Read recent comms messages.',
        parameters: { type: 'object', properties: { channel: { type: 'string' }, limit: { type: 'number' } } },
      },
      async (args, _ctx) => {
        const channel = String(args.channel ?? 'general');
        const limit = typeof args.limit === 'number' ? args.limit : 20;
        const messages = this.comms.getHistory(channel, { limit });
        if (messages.length === 0) return 'No messages.';
        return messages.map((m) =>
          `[${m.ts.toLocaleTimeString('en-US', { hour12: false })}] ${m.from}: ${m.content}`,
        ).join('\n');
      },
    );

    this.tools.register(
      {
        name: 'todo_write',
        description: 'Create or update task list for this session.',
        parameters: { type: 'object', properties: { todos: { type: 'array', items: { type: 'object' } } }, required: ['todos'] },
      },
      async (args, ctx) => {
        const todos = (args.todos as Array<{ id: string; content: string; status: string }>).map((t) => ({
          id: t.id,
          content: t.content,
          status: t.status as 'pending' | 'in_progress' | 'completed',
          createdAt: new Date().toISOString(),
          ...(t.status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
        }));
        this.stateStore.setTodos(ctx.sessionId, todos);
        this.events.emit('todo.updated', { sessionId: ctx.sessionId, todos });
        return `Updated ${todos.length} todo(s).`;
      },
    );

    this.tools.register(
      {
        name: 'todo_read',
        description: 'Read current task list for this session.',
        parameters: { type: 'object', properties: {} },
      },
      async (_args, ctx) => {
        const todos = this.stateStore.getTodos(ctx.sessionId);
        if (todos.length === 0) return 'No todos.';
        return todos.map((t) => `[${t.status}] ${t.id}: ${t.content}`).join('\n');
      },
    );
  }
}

export function createEngine(config: FastOpsConfig, opts?: EngineOptions): FastOpsEngine {
  return new FastOpsEngine(config, opts);
}
