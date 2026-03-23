import type { EventBus } from '../core/event-bus.js';

export interface CompactionAlert {
  sessionId: string;
  modelId: string;
  contextUsage: number;
  threshold: string;
  timestamp: number;
}

export class CompactionBroadcaster {
  private events: EventBus;
  private alerts: CompactionAlert[] = [];
  private teardowns: Array<() => void> = [];

  constructor(events: EventBus) {
    this.events = events;
  }

  wire(): void {
    const thresholds = [
      { event: 'compaction.checkpoint', name: 'checkpoint' },
      { event: 'compaction.summarize', name: 'summarize' },
      { event: 'compaction.handoff', name: 'handoff' },
      { event: 'compaction.hard_stop', name: 'hard_stop' },
      { event: 'compaction.started', name: 'compacting' },
    ];

    for (const { event, name } of thresholds) {
      const unsub = this.events.on(event, (...args: unknown[]) => {
        const p = args[0] as {
          sessionId: string;
          modelId: string;
          contextUsage?: number;
          tokensUsed?: number;
          tokensMax?: number;
        };

        const usage = p.contextUsage ??
          (p.tokensUsed && p.tokensMax ? p.tokensUsed / p.tokensMax : 0);

        const alert: CompactionAlert = {
          sessionId: p.sessionId,
          modelId: p.modelId,
          contextUsage: usage,
          threshold: name,
          timestamp: Date.now(),
        };

        this.alerts.push(alert);

        this.events.emit('compaction.broadcast', alert);
      });
      this.teardowns.push(unsub);
    }
  }

  unwire(): void {
    for (const fn of this.teardowns) {
      fn();
    }
    this.teardowns = [];
  }

  getAlerts(): CompactionAlert[] {
    return [...this.alerts];
  }

  getRecentAlerts(withinMs: number = 300_000): CompactionAlert[] {
    const cutoff = Date.now() - withinMs;
    return this.alerts.filter((a) => a.timestamp >= cutoff);
  }

  getModelAlert(modelId: string): CompactionAlert | undefined {
    for (let i = this.alerts.length - 1; i >= 0; i--) {
      if (this.alerts[i].modelId === modelId) {
        return this.alerts[i];
      }
    }
    return undefined;
  }

  clearAlerts(): void {
    this.alerts = [];
  }
}
