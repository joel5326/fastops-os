import type { EventBus } from '../core/event-bus.js';
import type { OnboardingLoader } from './loader.js';
import type { ContextManager } from '../context/manager.js';
import type { CommsBus, CommsMessage } from '../comms/types.js';
import type { OnboardingTriggerType } from './types.js';

export interface TriggerWiringDeps {
  events: EventBus;
  onboarding: OnboardingLoader;
  contextManager: ContextManager;
  comms: CommsBus;
}

interface TriggerRecord {
  sessionId: string;
  modelId: string;
  trigger: OnboardingTriggerType;
  contentId: string;
  ts: number;
}

export class OnboardingTriggerWiring {
  private deps: TriggerWiringDeps;
  private teardowns: Array<() => void> = [];
  private history: TriggerRecord[] = [];

  constructor(deps: TriggerWiringDeps) {
    this.deps = deps;
  }

  wireAll(): void {
    this.wireToolFinished();
    this.wireFirstCommsPost();
    this.wireFirstCompaction();
    this.wireFirstQcConflict();
  }

  unwireAll(): void {
    for (const fn of this.teardowns) {
      fn();
    }
    this.teardowns = [];
  }

  getHistory(): TriggerRecord[] {
    return [...this.history];
  }

  private fireTriggerAndEnqueue(
    sessionId: string,
    modelId: string,
    trigger: OnboardingTriggerType,
    extraEmitData?: Record<string, unknown>,
  ): boolean {
    const fired = this.deps.onboarding.fireTrigger(sessionId, modelId, trigger);
    if (!fired) return false;

    this.deps.contextManager.enqueueOnboardingContent(sessionId, fired.text);

    const record: TriggerRecord = {
      sessionId,
      modelId,
      trigger,
      contentId: fired.delivery.contentId,
      ts: Date.now(),
    };
    this.history.push(record);

    this.deps.events.emit('onboarding.triggered', {
      sessionId,
      modelId,
      trigger,
      contentId: fired.delivery.contentId,
      ...extraEmitData,
    });

    return true;
  }

  private wireToolFinished(): void {
    const unsub = this.deps.events.on('tool.finished', (...args: unknown[]) => {
      const p = args[0] as {
        sessionId: string;
        modelId: string;
        tool: string;
        isError: boolean;
      };
      if (p.isError) return;

      this.fireTriggerAndEnqueue(p.sessionId, p.modelId, 'first_tool_use', {
        tool: p.tool,
      });
    });
    this.teardowns.push(unsub);
  }

  private wireFirstCommsPost(): void {
    const unsub = this.deps.comms.subscribe({}, (msg: CommsMessage) => {
      const sessions = this.getActiveSessionsForModel(msg.from);
      for (const { sessionId, modelId } of sessions) {
        this.fireTriggerAndEnqueue(sessionId, modelId, 'first_comms_post');
      }
    });
    this.teardowns.push(unsub);
  }

  private wireFirstCompaction(): void {
    const unsub = this.deps.events.on('compaction.started', (...args: unknown[]) => {
      const p = args[0] as {
        sessionId: string;
        modelId: string;
      };

      this.fireTriggerAndEnqueue(p.sessionId, p.modelId, 'first_compaction');
    });
    this.teardowns.push(unsub);
  }

  private wireFirstQcConflict(): void {
    const unsub = this.deps.events.on('contract.qc_conflict', (...args: unknown[]) => {
      const p = args[0] as {
        sessionId: string;
        modelId: string;
        contractId: string;
      };

      this.fireTriggerAndEnqueue(p.sessionId, p.modelId, 'first_qc_conflict', {
        contractId: p.contractId,
      });
    });
    this.teardowns.push(unsub);
  }

  private getActiveSessionsForModel(
    modelId: string,
  ): Array<{ sessionId: string; modelId: string }> {
    const results: Array<{ sessionId: string; modelId: string }> = [];

    const state = this.deps.onboarding.getSessionState(modelId);
    if (state) {
      results.push({ sessionId: state.sessionId, modelId: state.modelId });
      return results;
    }

    return results;
  }
}
