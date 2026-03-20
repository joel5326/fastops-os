import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { FastOpsEngine } from '../engine/core/engine.js';

export function attachWebSocket(server: Server, engine: FastOpsEngine): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcast(type: string, data: unknown): void {
    const message = JSON.stringify({ type, data, ts: new Date().toISOString() });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  engine.events.on('session.created', (data) => broadcast('session.created', data));
  engine.events.on('task.dispatched', (data) => broadcast('task.dispatched', data));
  engine.events.on('task.completed', (data) => broadcast('task.completed', data));
  engine.events.on('task.failed', (data) => broadcast('task.failed', data));
  engine.events.on('tool.executed', (data) => broadcast('tool.executed', data));
  engine.events.on('todo.updated', (data) => broadcast('todo.updated', data));
  engine.events.on('engine.halted', (data) => broadcast('engine.halted', data));
  engine.events.on('loop.limit_reached', (data) => broadcast('loop.limit_reached', data));

  engine.comms.subscribe({}, (msg) => {
    broadcast('comms.message', {
      id: msg.id,
      from: msg.from,
      channel: msg.channel,
      content: msg.content,
      ts: msg.ts,
      flags: msg.flags,
    });
  });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({
      type: 'connected',
      data: { sessionCount: engine.sessions.list().length },
      ts: new Date().toISOString(),
    }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: new Date().toISOString() }));
        }
      } catch {
        // ignore malformed messages
      }
    });
  });

  return wss;
}
