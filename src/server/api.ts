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

  // ── Contract routes (FOS-05) ──

  router.get('/contracts', (req, res) => {
    const status = req.query.status as string | undefined;
    const wave = req.query.wave ? parseInt(String(req.query.wave)) : undefined;
    const contracts = engine.contracts.listContracts({
      status: status as any,
      wave,
    });
    res.json(contracts.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      wave: c.wave,
      claimedBy: c.claimedBy,
      qcBy: c.qcBy,
      validatedBy: c.validatedBy,
      dependencies: c.dependencies,
      blocks: c.blocks,
      artifacts: c.artifacts,
    })));
  });

  router.get('/contracts/ready', (_req, res) => {
    res.json(engine.contracts.getReady().map((c) => ({ id: c.id, name: c.name, wave: c.wave })));
  });

  router.get('/contracts/blocked', (_req, res) => {
    res.json(engine.contracts.getBlocked().map((c) => ({
      id: c.id,
      name: c.name,
      dependencies: c.dependencies,
    })));
  });

  router.get('/contracts/:id', (req, res) => {
    const contract = engine.contracts.getContract(req.params.id);
    if (!contract) {
      res.status(404).json({ error: `Contract not found: ${req.params.id}` });
      return;
    }
    res.json(contract);
  });

  router.get('/contracts/:id/audit', (req, res) => {
    try {
      const trail = engine.contracts.getAuditTrail(req.params.id);
      res.json(trail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(404).json({ error: msg });
    }
  });

  router.post('/contracts/:id/claim', (req, res) => {
    const { modelId } = req.body;
    if (!modelId) {
      res.status(400).json({ error: 'modelId is required' });
      return;
    }
    const result = engine.claimContract(req.params.id, modelId);
    res.status(result.success ? 200 : 409).json(result);
  });

  router.post('/contracts/:id/start', (req, res) => {
    const { modelId } = req.body;
    try {
      engine.contracts.startWork(req.params.id, modelId);
      engine.events.emit('contract.started', { contractId: req.params.id, modelId });
      res.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  router.post('/contracts/:id/built', (req, res) => {
    const { modelId, artifacts = [] } = req.body;
    try {
      engine.contracts.reportBuilt(req.params.id, modelId, artifacts);
      engine.events.emit('contract.built', { contractId: req.params.id, modelId, artifacts });
      res.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  router.post('/contracts/:id/qc', (req, res) => {
    const { pass, findings = [], failures = [], model, evidence = [] } = req.body;
    try {
      engine.contracts.reportQC(req.params.id, { pass, findings, failures, model, evidence });
      engine.events.emit('contract.qc', { contractId: req.params.id, pass, model });
      res.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  router.post('/contracts/:id/validate', (req, res) => {
    const { pass, evidence = [], model, notes } = req.body;
    try {
      engine.contracts.reportValidation(req.params.id, { pass, evidence, model, notes });
      engine.events.emit('contract.validated', { contractId: req.params.id, pass, model });
      res.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  router.post('/contracts/:id/assign-qc', (req, res) => {
    const { availableModels } = req.body;
    try {
      const assignment = engine.contracts.assignQCModel(req.params.id, availableModels || []);
      if (!assignment) {
        res.status(409).json({ error: 'No eligible QC model available' });
        return;
      }
      engine.events.emit('contract.qc_assigned', { contractId: req.params.id, assignedTo: assignment.assignedTo });
      res.json(assignment);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  router.post('/contracts/:id/assign-validator', (req, res) => {
    const { availableModels } = req.body;
    try {
      const validator = engine.contracts.assignValidatorModel(req.params.id, availableModels || []);
      if (!validator) {
        res.status(409).json({ error: 'No eligible validator available' });
        return;
      }
      engine.events.emit('contract.validator_assigned', { contractId: req.params.id, assignedTo: validator });
      res.json({ contractId: req.params.id, assignedTo: validator });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  // ── Kill Switch ──

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
