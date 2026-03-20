type EventHandler = (...args: unknown[]) => void;

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);

    return () => {
      const list = this.handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
    };
  }

  emit(event: string, ...args: unknown[]): void {
    const list = this.handlers.get(event);
    if (!list) return;
    for (const handler of list) {
      try {
        handler(...args);
      } catch {
        // handler errors should not break the bus
      }
    }
  }

  removeAll(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.length ?? 0;
  }
}
