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

  function sendTo(ws: WebSocket, type: string, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data, ts: new Date().toISOString() }));
    }
  }

  engine.events.on('session.created', (data) => broadcast('session.created', data));
  engine.events.on('task.dispatched', (data) => broadcast('task.dispatched', data));
  engine.events.on('task.completed', (data) => broadcast('task.completed', data));
  engine.events.on('task.failed', (data) => broadcast('task.failed', data));
  engine.events.on('tool.executed', (data) => broadcast('tool.executed', data));
  engine.events.on('tool.finished', (data) => broadcast('tool.finished', data));
  engine.events.on('todo.updated', (data) => broadcast('todo.updated', data));
  engine.events.on('engine.halted', (data) => broadcast('engine.halted', data));
  engine.events.on('loop.limit_reached', (data) => broadcast('loop.limit_reached', data));

  engine.events.on('contracts.loaded', (data) => broadcast('contracts.loaded', data));
  engine.events.on('contract.claimed', (data) => broadcast('contract.claimed', data));
  engine.events.on('contract.started', (data) => broadcast('contract.started', data));
  engine.events.on('contract.built', (data) => broadcast('contract.built', data));
  engine.events.on('contract.qc', (data) => broadcast('contract.qc', data));
  engine.events.on('contract.qc_assigned', (data) => broadcast('contract.qc_assigned', data));
  engine.events.on('contract.validated', (data) => broadcast('contract.validated', data));
  engine.events.on('contract.validator_assigned', (data) => broadcast('contract.validator_assigned', data));

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

  /**
   * Handle streaming dispatch over WebSocket.
   * Client sends: { type: 'stream', sessionId, content, taskType?, contractId? }
   * Server replies with a sequence of:
   *   { type: 'stream.delta', data: { sessionId, delta, done } }
   *   { type: 'stream.tool_call', data: { sessionId, tool, id, arguments } }
   *   { type: 'stream.tool_result', data: { sessionId, tool, id, output, isError } }
   *   { type: 'stream.complete', data: { sessionId, modelId, duration, toolCallCount } }
   *   { type: 'stream.error', data: { sessionId, error } }
   *
   * Concurrency: The dispatcher throws if a session is already 'working',
   * so concurrent stream requests on the same session are rejected at the
   * engine level and returned as stream.error to the client.
   *
   * Client disconnect: If the WS closes mid-stream, we stop sending events
   * but the dispatcher loop continues to completion server-side. Adding
   * cancellation tokens to dispatchStream would address this (future work).
   *
   * Authentication: Not implemented on WS. Pre-existing gap — adding auth
   * is a TEAM-scoped change per constitution.
   */
  async function handleStreamRequest(
    ws: WebSocket,
    msg: { sessionId: string; content: string; taskType?: string; contractId?: string },
  ): Promise<void> {
    const { sessionId, content, taskType = 'freeform', contractId } = msg;

    if (!sessionId || !content) {
      sendTo(ws, 'stream.error', { error: 'sessionId and content are required' });
      return;
    }

    try {
      const stream = engine.dispatchStream(sessionId, {
        type: taskType as 'freeform' | 'contract' | 'qc' | 'review',
        contractId,
        prompt: content,
      });

      for await (const event of stream) {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn(`[WS] Client disconnected mid-stream for session ${sessionId}`);
          break;
        }

        switch (event.type) {
          case 'delta':
            sendTo(ws, 'stream.delta', { sessionId, delta: event.delta, done: event.done });
            break;
          case 'tool_call':
            sendTo(ws, 'stream.tool_call', {
              sessionId,
              tool: event.tool,
              id: event.id,
              arguments: event.arguments,
            });
            break;
          case 'tool_result':
            sendTo(ws, 'stream.tool_result', {
              sessionId,
              tool: event.tool,
              id: event.id,
              output: event.output,
              isError: event.isError,
            });
            break;
          case 'complete':
            sendTo(ws, 'stream.complete', {
              sessionId: event.sessionId,
              modelId: event.modelId,
              duration: event.duration,
              toolCallCount: event.toolCallCount,
            });
            break;
          case 'error':
            sendTo(ws, 'stream.error', { sessionId, error: event.error });
            break;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[WS] Stream error for session ${sessionId}:`, errorMsg);
      sendTo(ws, 'stream.error', { sessionId, error: errorMsg });
    }
  }

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
        } else if (msg.type === 'stream') {
          // Fire and forget — errors are sent back via stream.error
          handleStreamRequest(ws, msg).catch((err) => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`[WS] Unhandled stream error for session ${msg.sessionId}:`, errorMsg);
            sendTo(ws, 'stream.error', {
              sessionId: msg.sessionId,
              error: errorMsg,
            });
          });
        }
      } catch {
        // ignore malformed messages
      }
    });
  });

  return wss;
}
