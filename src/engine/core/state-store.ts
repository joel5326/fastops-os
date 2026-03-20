import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';

export interface MissionStatus {
  id: string;
  name: string;
  status: 'active' | 'complete' | 'blocked' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface ContractStatus {
  id: string;
  name: string;
  status: 'open' | 'claimed' | 'building' | 'qc' | 'complete' | 'blocked';
  builder?: string;
  qc?: string;
  claimedAt?: string;
  completedAt?: string;
}

export interface ModelRoster {
  modelId: string;
  provider: string;
  status: 'online' | 'offline' | 'error';
  currentTask?: string;
  sessionId?: string;
}

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
  completedAt?: string;
}

export interface EngineState {
  missions: MissionStatus[];
  contracts: ContractStatus[];
  models: ModelRoster[];
  halt: boolean;
  todos: Record<string, TodoItem[]>;
  sessionCosts: Record<string, number>;
  totalCost: number;
  startedAt: string;
  lastUpdatedAt: string;
}

export class StateStore {
  private state: EngineState;
  private filePath: string;
  private writeTimer?: ReturnType<typeof setTimeout>;
  private debounceMs: number;

  constructor(filePath: string, debounceMs: number = 1000) {
    this.filePath = filePath;
    this.debounceMs = debounceMs;
    this.state = this.loadOrCreate();
  }

  get(): EngineState {
    return this.state;
  }

  update(patch: Partial<EngineState>): void {
    this.state = {
      ...this.state,
      ...patch,
      lastUpdatedAt: new Date().toISOString(),
    };
    this.schedulePersist();
  }

  updateContract(id: string, patch: Partial<ContractStatus>): void {
    const contracts = this.state.contracts.map((c) =>
      c.id === id ? { ...c, ...patch } : c,
    );
    this.update({ contracts });
  }

  updateModel(modelId: string, patch: Partial<ModelRoster>): void {
    const models = this.state.models.map((m) =>
      m.modelId === modelId ? { ...m, ...patch } : m,
    );
    this.update({ models });
  }

  setTodos(sessionId: string, todos: TodoItem[]): void {
    const allTodos = { ...this.state.todos, [sessionId]: todos.slice(0, 50) };
    this.update({ todos: allTodos });
  }

  getTodos(sessionId: string): TodoItem[] {
    return this.state.todos[sessionId] ?? [];
  }

  getAllTodos(): Record<string, TodoItem[]> {
    return this.state.todos;
  }

  addCost(sessionId: string, cost: number): void {
    const sessionCosts = { ...this.state.sessionCosts };
    sessionCosts[sessionId] = (sessionCosts[sessionId] ?? 0) + cost;
    this.update({
      sessionCosts,
      totalCost: this.state.totalCost + cost,
    });
  }

  isHalted(): boolean {
    return this.state.halt;
  }

  setHalt(halt: boolean): void {
    this.update({ halt });
  }

  persistNow(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }
    this.atomicWrite();
  }

  destroy(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }
    this.atomicWrite();
  }

  private schedulePersist(): void {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined;
      this.atomicWrite();
    }, this.debounceMs);
  }

  private atomicWrite(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const tmpPath = this.filePath + '.tmp';
    writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf8');
    renameSync(tmpPath, this.filePath);
  }

  private loadOrCreate(): EngineState {
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, 'utf8');
        return JSON.parse(raw);
      } catch {
        // corrupted state file — start fresh
      }
    }

    return {
      missions: [],
      contracts: [],
      models: [],
      halt: false,
      todos: {},
      sessionCosts: {},
      totalCost: 0,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
  }
}
