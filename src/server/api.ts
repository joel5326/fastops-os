import express from 'express';
import cors from 'cors';
import type { FastOpsEngine } from '../engine/core/engine.js';

export function createApiRouter(engine: FastOpsEngine): express.Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', running: engine.isRunning() });
  });

  router.get('/sessions', (_req, res) => {
    const sessions = engine.sessions.list().map((s) => ({
      id: s.id,
      modelId: s.modelId,
      provider: s.provider,
      status: s.status,
      currentTask: s.currentTask,
      tokensBurned: s.tokensBurned,
      costAccumulated: s.costAccumulated,
      messageCount: s.messages.length,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
    }));
    res.json(sessions);
  });

  router.post('/sessions', (req, res) => {
    const { modelId, model } = req.body;
    if (!modelId) {
      res.status(400).json({ error: 'modelId is required' });
      return;
    }

    try {
      const session = engine.createSession(modelId, { model });
      res.json({ id: session.id, modelId: session.modelId, status: session.status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  router.post('/sessions/:id/message', async (req, res) => {
    const { id } = req.params;
    const { content, type = 'freeform', contractId } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    try {
      const result = await engine.dispatch(id, {
        type,
        contractId,
        prompt: content,
      });

      res.json({
        sessionId: result.sessionId,
        content: result.response.content,
        usage: result.response.usage,
        duration: result.duration,
        toolCallCount: result.toolCallCount,
        success: result.success,
        error: result.error,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  router.get('/sessions/:id/messages', (req, res) => {
    const session = engine.sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session.messages);
  });

  router.delete('/sessions/:id', (req, res) => {
    try {
      engine.sessions.close(req.params.id);
      res.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(404).json({ error: msg });
    }
  });

  router.get('/state', (_req, res) => {
    res.json(engine.stateStore.get());
  });

  router.get('/adapters', (_req, res) => {
    try {
      const registry = (engine as unknown as { registry: { listAvailable: () => string[]; listAllModels: () => Array<{ provider: string; model: string }> } }).registry;
      res.json({
        available: registry.listAvailable(),
        models: registry.listAllModels(),
      });
    } catch {
      res.json({ available: [], models: [] });
    }
  });

  router.post('/comms/send', (req, res) => {
    const { channel = 'general', content, from = 'joel' } = req.body;
    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const msg = engine.comms.send({ from, channel, content });
    res.json(msg);
  });

  router.get('/comms/:channel', (req, res) => {
    const limit = parseInt(String(req.query.limit ?? '50'));
    const messages = engine.comms.getHistory(req.params.channel, { limit });
    res.json(messages);
  });

  router.get('/comms', (_req, res) => {
    const channels = engine.comms.listChannels();
    res.json({ channels });
  });

  router.post('/kill-switch', (_req, res) => {
    engine.stateStore.setHalt(true);
    engine.events.emit('engine.halted', {});
    res.json({ halted: true });
  });

  router.delete('/kill-switch', (_req, res) => {
    engine.stateStore.setHalt(false);
    res.json({ halted: false });
  });

  return router;
}

export function createApp(engine: FastOpsEngine): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', createApiRouter(engine));
  return app;
}
