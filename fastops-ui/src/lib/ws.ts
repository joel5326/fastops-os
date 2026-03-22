'use client';

type WsHandler = (data: any) => void;

export class FastOpsSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers = new Map<string, Set<WsHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  constructor(url?: string) {
    this.url = url || 'ws://localhost:3100/ws';
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.emit('_connected', {});
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this.emit(msg.type, msg.data);
      } catch { /* ignore malformed */ }
    };

    this.ws.onclose = () => {
      this.emit('_disconnected', {});
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  on(type: string, handler: WsHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  private emit(type: string, data: any): void {
    this.handlers.get(type)?.forEach((h) => h(data));
    this.handlers.get('*')?.forEach((h) => h({ type, data }));
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      this.connect();
    }, this.reconnectDelay);
  }
}

let instance: FastOpsSocket | null = null;

export function getSocket(): FastOpsSocket {
  if (!instance) {
    instance = new FastOpsSocket();
    instance.connect();
  }
  return instance;
}
