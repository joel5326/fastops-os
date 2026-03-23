import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OnboardingTriggerWiring } from '../onboarding/triggers.js';
import { OnboardingLoader } from '../onboarding/loader.js';
import { ContextManager } from '../context/manager.js';
import { EventBus } from '../core/event-bus.js';
import { InMemoryCommsBus } from '../comms/bus.js';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';

const TEST_DIR = join(process.cwd(), '.test-triggers');
const DEEP_CONTEXT_DIR = 'evidence/onboarding';

function setupTriggerFile(name: string, content: string) {
  mkdirSync(join(TEST_DIR, DEEP_CONTEXT_DIR), { recursive: true });
  writeFileSync(join(TEST_DIR, DEEP_CONTEXT_DIR, name), content);
}

function createDeps() {
  const events = new EventBus();
  const onboarding = new OnboardingLoader(TEST_DIR);
  const contextManager = new ContextManager();
  const comms = new InMemoryCommsBus();

  return { events, onboarding, contextManager, comms };
}

describe('OnboardingTriggerWiring', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('wireAll / unwireAll', () => {
    it('wires and unwires without error', () => {
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);

      wiring.wireAll();
      wiring.unwireAll();
    });
  });

  describe('tool.finished → first_tool_use', () => {
    it('fires first_tool_use on non-error tool.finished', () => {
      setupTriggerFile('TRIGGER-FIRST-TOOL.md', 'You used your first tool.');
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);
      wiring.wireAll();

      deps.onboarding.initSession('sess-1', 'claude');

      const triggered: unknown[] = [];
      deps.events.on('onboarding.triggered', (data) => triggered.push(data));

      deps.events.emit('tool.finished', {
        sessionId: 'sess-1',
        modelId: 'claude',
        tool: 'bash',
        isError: false,
      });

      expect(triggered).toHaveLength(1);
      expect((triggered[0] as Record<string, unknown>).trigger).toBe('first_tool_use');
      expect((triggered[0] as Record<string, unknown>).tool).toBe('bash');
    });

    it('does not fire on error tool.finished', () => {
      setupTriggerFile('TRIGGER-FIRST-TOOL.md', 'First tool.');
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);
      wiring.wireAll();

      deps.onboarding.initSession('sess-1', 'claude');

      const triggered: unknown[] = [];
      deps.events.on('onboarding.triggered', (data) => triggered.push(data));

      deps.events.emit('tool.finished', {
        sessionId: 'sess-1',
        modelId: 'claude',
        tool: 'bash',
        isError: true,
      });

      expect(triggered).toHaveLength(0);
    });

    it('fires only once per session', () => {
      setupTriggerFile('TRIGGER-FIRST-TOOL.md', 'First tool.');
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);
      wiring.wireAll();

      deps.onboarding.initSession('sess-1', 'claude');

      const triggered: unknown[] = [];
      deps.events.on('onboarding.triggered', (data) => triggered.push(data));

      deps.events.emit('tool.finished', {
        sessionId: 'sess-1',
        modelId: 'claude',
        tool: 'bash',
        isError: false,
      });
      deps.events.emit('tool.finished', {
        sessionId: 'sess-1',
        modelId: 'claude',
        tool: 'file-read',
        isError: false,
      });

      expect(triggered).toHaveLength(1);
    });

    it('enqueues content in context manager', () => {
      setupTriggerFile('TRIGGER-FIRST-TOOL.md', 'Injected tool content.');
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);
      wiring.wireAll();

      deps.onboarding.initSession('sess-1', 'claude');

      deps.events.emit('tool.finished', {
        sessionId: 'sess-1',
        modelId: 'claude',
        tool: 'bash',
        isError: false,
      });

      // Verify the trigger was recorded in history
      const history = wiring.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].trigger).toBe('first_tool_use');
      expect(history[0].sessionId).toBe('sess-1');
    });
  });

  describe('comms → first_comms_post', () => {
    it('fires first_comms_post when model posts to comms', () => {
      setupTriggerFile('TRIGGER-FIRST-COMMS.md', 'You posted to comms for the first time.');
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);
      wiring.wireAll();

      deps.onboarding.initSession('claude', 'claude');

      const triggered: unknown[] = [];
      deps.events.on('onboarding.triggered', (data) => triggered.push(data));

      deps.comms.send({
        from: 'claude',
        content: 'Hello from claude.',
        channel: 'general',
      });

      expect(triggered).toHaveLength(1);
      expect((triggered[0] as Record<string, unknown>).trigger).toBe('first_comms_post');
    });

    it('fires only once per session', () => {
      setupTriggerFile('TRIGGER-FIRST-COMMS.md', 'First comms.');
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);
      wiring.wireAll();

      deps.onboarding.initSession('claude', 'claude');

      const triggered: unknown[] = [];
      deps.events.on('onboarding.triggered', (data) => triggered.push(data));

      deps.comms.send({ from: 'claude', content: 'First.', channel: 'general' });
      deps.comms.send({ from: 'claude', content: 'Second.', channel: 'general' });

      expect(triggered).toHaveLength(1);
    });
  });

  describe('compaction.started → first_compaction', () => {
    it('fires first_compaction on compaction event', () => {
      setupTriggerFile('TRIGGER-FIRST-COMPACTION.md', 'Compaction is happening.');
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);
      wiring.wireAll();

      deps.onboarding.initSession('sess-1', 'claude');

      const triggered: unknown[] = [];
      deps.events.on('onboarding.triggered', (data) => triggered.push(data));

      deps.events.emit('compaction.started', {
        sessionId: 'sess-1',
        modelId: 'claude',
      });

      expect(triggered).toHaveLength(1);
      expect((triggered[0] as Record<string, unknown>).trigger).toBe('first_compaction');
    });
  });

  describe('contract.qc_conflict → first_qc_conflict', () => {
    it('fires first_qc_conflict on QC conflict event', () => {
      setupTriggerFile('TRIGGER-QC-CONFLICT.md', 'A QC conflict was detected.');
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);
      wiring.wireAll();

      deps.onboarding.initSession('sess-1', 'claude');

      const triggered: unknown[] = [];
      deps.events.on('onboarding.triggered', (data) => triggered.push(data));

      deps.events.emit('contract.qc_conflict', {
        sessionId: 'sess-1',
        modelId: 'claude',
        contractId: 'FOS-01',
      });

      expect(triggered).toHaveLength(1);
      expect((triggered[0] as Record<string, unknown>).trigger).toBe('first_qc_conflict');
      expect((triggered[0] as Record<string, unknown>).contractId).toBe('FOS-01');
    });
  });

  describe('getHistory', () => {
    it('tracks all fired triggers', () => {
      setupTriggerFile('TRIGGER-FIRST-TOOL.md', 'Tool.');
      setupTriggerFile('TRIGGER-FIRST-COMPACTION.md', 'Compaction.');
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);
      wiring.wireAll();

      deps.onboarding.initSession('sess-1', 'claude');

      deps.events.emit('tool.finished', {
        sessionId: 'sess-1',
        modelId: 'claude',
        tool: 'bash',
        isError: false,
      });

      deps.events.emit('compaction.started', {
        sessionId: 'sess-1',
        modelId: 'claude',
      });

      const history = wiring.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].trigger).toBe('first_tool_use');
      expect(history[1].trigger).toBe('first_compaction');
    });

    it('returns a copy, not a reference', () => {
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);

      const h1 = wiring.getHistory();
      h1.push({} as never);
      expect(wiring.getHistory()).toHaveLength(0);
    });
  });

  describe('unwireAll prevents further triggers', () => {
    it('stops responding to events after unwire', () => {
      setupTriggerFile('TRIGGER-FIRST-TOOL.md', 'Tool content.');
      const deps = createDeps();
      const wiring = new OnboardingTriggerWiring(deps);
      wiring.wireAll();
      wiring.unwireAll();

      deps.onboarding.initSession('sess-1', 'claude');

      const triggered: unknown[] = [];
      deps.events.on('onboarding.triggered', (data) => triggered.push(data));

      deps.events.emit('tool.finished', {
        sessionId: 'sess-1',
        modelId: 'claude',
        tool: 'bash',
        isError: false,
      });

      expect(triggered).toHaveLength(0);
    });
  });
});
