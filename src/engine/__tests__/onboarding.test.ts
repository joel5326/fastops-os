import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OnboardingLoader } from '../onboarding/loader.js';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';

const TEST_DIR = join(process.cwd(), '.test-onboarding');
const UNIVERSAL_PATH = 'evidence/onboarding/SESSION-START-UNIVERSAL.md';
const MODEL_PROMPTS_DIR = 'src/engine/context/prompts';
const DEEP_CONTEXT_DIR = 'evidence/onboarding';

function setupTestFiles(options?: {
  universal?: string;
  modelPrompt?: { modelId: string; content: string };
  triggerFile?: { name: string; content: string };
}) {
  mkdirSync(join(TEST_DIR, 'evidence', 'onboarding'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'src', 'engine', 'context', 'prompts'), { recursive: true });

  if (options?.universal !== undefined) {
    writeFileSync(
      join(TEST_DIR, UNIVERSAL_PATH),
      options.universal,
    );
  }

  if (options?.modelPrompt) {
    writeFileSync(
      join(TEST_DIR, MODEL_PROMPTS_DIR, `${options.modelPrompt.modelId}.md`),
      options.modelPrompt.content,
    );
  }

  if (options?.triggerFile) {
    writeFileSync(
      join(TEST_DIR, DEEP_CONTEXT_DIR, options.triggerFile.name),
      options.triggerFile.content,
    );
  }
}

describe('OnboardingLoader', () => {
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

  describe('initSession', () => {
    it('creates session state with correct defaults', () => {
      const loader = new OnboardingLoader(TEST_DIR);
      const state = loader.initSession('sess-1', 'claude');

      expect(state.sessionId).toBe('sess-1');
      expect(state.modelId).toBe('claude');
      expect(state.universalDelivered).toBe(false);
      expect(state.modelIdentityDelivered).toBe(false);
      expect(state.deliveries).toEqual([]);
      expect(state.triggersArmed.has('first_tool_use')).toBe(true);
      expect(state.triggersArmed.has('first_compaction')).toBe(true);
      expect(state.triggersArmed.has('first_qc_conflict')).toBe(true);
      expect(state.triggersArmed.has('first_comms_post')).toBe(true);
      expect(state.triggersFired.size).toBe(0);
    });

    it('overwrites existing session state', () => {
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');
      const state2 = loader.initSession('sess-1', 'gpt');

      expect(state2.modelId).toBe('gpt');
      expect(state2.universalDelivered).toBe(false);
    });
  });

  describe('getSessionState', () => {
    it('returns undefined for unknown session', () => {
      const loader = new OnboardingLoader(TEST_DIR);
      expect(loader.getSessionState('nonexistent')).toBeUndefined();
    });

    it('returns state for initialized session', () => {
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');
      const state = loader.getSessionState('sess-1');
      expect(state).toBeDefined();
      expect(state!.sessionId).toBe('sess-1');
    });
  });

  describe('isOnboarded', () => {
    it('returns false for unknown session', () => {
      const loader = new OnboardingLoader(TEST_DIR);
      expect(loader.isOnboarded('nonexistent')).toBe(false);
    });

    it('returns false before universal is delivered', () => {
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');
      expect(loader.isOnboarded('sess-1')).toBe(false);
    });

    it('returns true after universal is delivered via buildOnboardingLayer', () => {
      setupTestFiles({ universal: 'You are part of the colony.' });
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');
      loader.buildOnboardingLayer('sess-1', 'claude');
      expect(loader.isOnboarded('sess-1')).toBe(true);
    });
  });

  describe('buildOnboardingLayer', () => {
    it('returns empty layer when disabled', () => {
      const loader = new OnboardingLoader(TEST_DIR, { enabled: false });
      const layer = loader.buildOnboardingLayer('sess-1', 'claude');

      expect(layer.text).toBe('');
      expect(layer.tokens).toBe(0);
      expect(layer.deliveries).toEqual([]);
    });

    it('returns empty layer when model is disabled via override', () => {
      setupTestFiles({ universal: 'You are part of the colony.' });
      const loader = new OnboardingLoader(TEST_DIR, {
        modelOverrides: { claude: { enabled: false } },
      });
      const layer = loader.buildOnboardingLayer('sess-1', 'claude');

      expect(layer.text).toBe('');
      expect(layer.tokens).toBe(0);
    });

    it('loads universal prompt', () => {
      const universalContent = 'Welcome to FastOps. Joel built this.';
      setupTestFiles({ universal: universalContent });
      const loader = new OnboardingLoader(TEST_DIR);

      const layer = loader.buildOnboardingLayer('sess-1', 'claude');

      expect(layer.text).toContain(universalContent);
      expect(layer.tokens).toBeGreaterThan(0);
      expect(layer.deliveries).toHaveLength(1);
      expect(layer.deliveries[0].contentId).toBe('universal-session-start');
      expect(layer.deliveries[0].triggeredBy).toBe('session_start');
    });

    it('loads both universal and model-specific prompts', () => {
      setupTestFiles({
        universal: 'Universal content here.',
        modelPrompt: { modelId: 'claude', content: 'You are Claude. You build.' },
      });
      const loader = new OnboardingLoader(TEST_DIR);

      const layer = loader.buildOnboardingLayer('sess-1', 'claude');

      expect(layer.text).toContain('Universal content here.');
      expect(layer.text).toContain('You are Claude. You build.');
      expect(layer.deliveries).toHaveLength(2);
      expect(layer.deliveries[1].contentId).toBe('model-identity-claude');
    });

    it('skips universal when model override says so', () => {
      setupTestFiles({
        universal: 'Universal content.',
        modelPrompt: { modelId: 'claude', content: 'Claude-specific.' },
      });
      const loader = new OnboardingLoader(TEST_DIR, {
        modelOverrides: { claude: { skipUniversal: true } },
      });

      const layer = loader.buildOnboardingLayer('sess-1', 'claude');

      expect(layer.text).not.toContain('Universal content.');
      expect(layer.text).toContain('Claude-specific.');
      expect(layer.deliveries).toHaveLength(1);
    });

    it('auto-initializes session if not initialized', () => {
      setupTestFiles({ universal: 'Auto-init test.' });
      const loader = new OnboardingLoader(TEST_DIR);

      const layer = loader.buildOnboardingLayer('new-session', 'claude');

      expect(layer.text).toContain('Auto-init test.');
      expect(loader.getSessionState('new-session')).toBeDefined();
    });

    it('respects token budget', () => {
      const longContent = 'x'.repeat(80000);
      setupTestFiles({ universal: longContent });
      const loader = new OnboardingLoader(TEST_DIR);

      const layer = loader.buildOnboardingLayer('sess-1', 'claude');

      expect(layer.text).toBe('');
      expect(layer.deliveries).toHaveLength(0);
    });

    it('respects model-specific token budget', () => {
      setupTestFiles({ universal: 'Short.' });
      const loader = new OnboardingLoader(TEST_DIR, {
        modelOverrides: { claude: { maxTokenBudget: 1 } },
      });

      const layer = loader.buildOnboardingLayer('sess-1', 'claude');

      expect(layer.deliveries).toHaveLength(0);
    });

    it('handles missing universal prompt file gracefully', () => {
      const loader = new OnboardingLoader(TEST_DIR);

      const layer = loader.buildOnboardingLayer('sess-1', 'claude');

      expect(layer.text).toBe('');
      expect(layer.tokens).toBe(0);
      expect(layer.deliveries).toHaveLength(0);
    });

    it('handles missing model prompt file gracefully', () => {
      setupTestFiles({ universal: 'Universal only.' });
      const loader = new OnboardingLoader(TEST_DIR);

      const layer = loader.buildOnboardingLayer('sess-1', 'claude');

      expect(layer.text).toContain('Universal only.');
      expect(layer.deliveries).toHaveLength(1);
    });

    it('marks universalDelivered in session state', () => {
      setupTestFiles({ universal: 'Delivered.' });
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');

      loader.buildOnboardingLayer('sess-1', 'claude');

      const state = loader.getSessionState('sess-1');
      expect(state!.universalDelivered).toBe(true);
    });

    it('marks modelIdentityDelivered in session state', () => {
      setupTestFiles({
        universal: 'Universal.',
        modelPrompt: { modelId: 'claude', content: 'Identity.' },
      });
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');

      loader.buildOnboardingLayer('sess-1', 'claude');

      const state = loader.getSessionState('sess-1');
      expect(state!.modelIdentityDelivered).toBe(true);
    });

    it('joins parts with separator', () => {
      setupTestFiles({
        universal: 'Part A',
        modelPrompt: { modelId: 'claude', content: 'Part B' },
      });
      const loader = new OnboardingLoader(TEST_DIR);

      const layer = loader.buildOnboardingLayer('sess-1', 'claude');

      expect(layer.text).toContain('---');
      expect(layer.text.indexOf('Part A')).toBeLessThan(layer.text.indexOf('Part B'));
    });
  });

  describe('fireTrigger', () => {
    it('fires an armed trigger and returns content', () => {
      setupTestFiles({
        triggerFile: {
          name: 'TRIGGER-FIRST-TOOL.md',
          content: 'You just used your first tool. The colony watches.',
        },
      });
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');

      const result = loader.fireTrigger('sess-1', 'claude', 'first_tool_use');

      expect(result).not.toBeNull();
      expect(result!.text).toContain('first tool');
      expect(result!.delivery.triggeredBy).toBe('first_tool_use');
      expect(result!.delivery.contentId).toBe('trigger-first_tool_use');
      expect(result!.delivery.tokenCost).toBeGreaterThan(0);
    });

    it('does not fire same trigger twice', () => {
      setupTestFiles({
        triggerFile: {
          name: 'TRIGGER-FIRST-TOOL.md',
          content: 'First tool content.',
        },
      });
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');

      const first = loader.fireTrigger('sess-1', 'claude', 'first_tool_use');
      const second = loader.fireTrigger('sess-1', 'claude', 'first_tool_use');

      expect(first).not.toBeNull();
      expect(second).toBeNull();
    });

    it('returns null for unarmed trigger', () => {
      const loader = new OnboardingLoader(TEST_DIR);
      const state = loader.initSession('sess-1', 'claude');
      state.triggersArmed.delete('first_tool_use');

      const result = loader.fireTrigger('sess-1', 'claude', 'first_tool_use');
      expect(result).toBeNull();
    });

    it('returns null when trigger file does not exist', () => {
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');

      const result = loader.fireTrigger('sess-1', 'claude', 'first_tool_use');
      expect(result).toBeNull();
    });

    it('updates session state after firing', () => {
      setupTestFiles({
        triggerFile: {
          name: 'TRIGGER-FIRST-TOOL.md',
          content: 'Trigger content.',
        },
      });
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');

      loader.fireTrigger('sess-1', 'claude', 'first_tool_use');

      const state = loader.getSessionState('sess-1');
      expect(state!.triggersFired.has('first_tool_use')).toBe(true);
      expect(state!.triggersArmed.has('first_tool_use')).toBe(false);
      expect(state!.deliveries).toHaveLength(1);
    });

    it('auto-initializes session if not initialized', () => {
      setupTestFiles({
        triggerFile: {
          name: 'TRIGGER-FIRST-TOOL.md',
          content: 'Auto-init trigger.',
        },
      });
      const loader = new OnboardingLoader(TEST_DIR);

      const result = loader.fireTrigger('new-sess', 'claude', 'first_tool_use');

      expect(result).not.toBeNull();
      expect(loader.getSessionState('new-sess')).toBeDefined();
    });

    it('fires different triggers independently', () => {
      setupTestFiles({
        triggerFile: {
          name: 'TRIGGER-FIRST-TOOL.md',
          content: 'Tool trigger.',
        },
      });
      writeFileSync(
        join(TEST_DIR, DEEP_CONTEXT_DIR, 'TRIGGER-FIRST-COMPACTION.md'),
        'Compaction trigger.',
      );
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');

      const toolResult = loader.fireTrigger('sess-1', 'claude', 'first_tool_use');
      const compResult = loader.fireTrigger('sess-1', 'claude', 'first_compaction');

      expect(toolResult).not.toBeNull();
      expect(compResult).not.toBeNull();
      expect(toolResult!.text).toContain('Tool trigger');
      expect(compResult!.text).toContain('Compaction trigger');
    });
  });

  describe('getStatus', () => {
    it('returns null for unknown session', () => {
      const loader = new OnboardingLoader(TEST_DIR);
      expect(loader.getStatus('nonexistent')).toBeNull();
    });

    it('returns correct status after onboarding', () => {
      setupTestFiles({ universal: 'Status test content.' });
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');
      loader.buildOnboardingLayer('sess-1', 'claude');

      const status = loader.getStatus('sess-1');

      expect(status).not.toBeNull();
      expect(status!.onboarded).toBe(true);
      expect(status!.universalDelivered).toBe(true);
      expect(status!.totalDeliveries).toBe(1);
      expect(status!.totalTokensSpent).toBeGreaterThan(0);
      expect(status!.triggersArmed).toContain('first_tool_use');
      expect(status!.triggersFired).toHaveLength(0);
    });

    it('reflects trigger state after firing', () => {
      setupTestFiles({
        universal: 'Content.',
        triggerFile: {
          name: 'TRIGGER-FIRST-TOOL.md',
          content: 'Trigger.',
        },
      });
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');
      loader.buildOnboardingLayer('sess-1', 'claude');
      loader.fireTrigger('sess-1', 'claude', 'first_tool_use');

      const status = loader.getStatus('sess-1');

      expect(status!.totalDeliveries).toBe(2);
      expect(status!.triggersFired).toContain('first_tool_use');
      expect(status!.triggersArmed).not.toContain('first_tool_use');
    });
  });

  describe('updateConfig', () => {
    it('clears caches when config updates', () => {
      setupTestFiles({ universal: 'Original.' });
      const loader = new OnboardingLoader(TEST_DIR);

      const layer1 = loader.buildOnboardingLayer('sess-1', 'claude');
      expect(layer1.text).toContain('Original.');

      writeFileSync(join(TEST_DIR, UNIVERSAL_PATH), 'Updated.');
      loader.updateConfig({ enabled: true });

      const layer2 = loader.buildOnboardingLayer('sess-2', 'claude');
      expect(layer2.text).toContain('Updated.');
    });

    it('can disable onboarding via config update', () => {
      setupTestFiles({ universal: 'Should not appear.' });
      const loader = new OnboardingLoader(TEST_DIR);
      loader.updateConfig({ enabled: false });

      const layer = loader.buildOnboardingLayer('sess-1', 'claude');
      expect(layer.text).toBe('');
    });
  });

  describe('caching', () => {
    it('caches universal prompt on repeated calls', () => {
      setupTestFiles({ universal: 'Cached content.' });
      const loader = new OnboardingLoader(TEST_DIR);

      const layer1 = loader.buildOnboardingLayer('sess-1', 'claude');
      const layer2 = loader.buildOnboardingLayer('sess-2', 'claude');

      expect(layer1.text).toBe(layer2.text);
    });

    it('caches model prompt on repeated calls', () => {
      setupTestFiles({
        universal: 'Universal.',
        modelPrompt: { modelId: 'claude', content: 'Claude cached.' },
      });
      const loader = new OnboardingLoader(TEST_DIR);

      const layer1 = loader.buildOnboardingLayer('sess-1', 'claude');
      const layer2 = loader.buildOnboardingLayer('sess-2', 'claude');

      expect(layer1.text).toBe(layer2.text);
    });
  });

  describe('multiple sessions', () => {
    it('tracks sessions independently', () => {
      setupTestFiles({
        universal: 'Universal.',
        triggerFile: {
          name: 'TRIGGER-FIRST-TOOL.md',
          content: 'Trigger.',
        },
      });
      const loader = new OnboardingLoader(TEST_DIR);
      loader.initSession('sess-1', 'claude');
      loader.initSession('sess-2', 'gpt');

      loader.buildOnboardingLayer('sess-1', 'claude');
      loader.fireTrigger('sess-1', 'claude', 'first_tool_use');

      const status1 = loader.getStatus('sess-1');
      const status2 = loader.getStatus('sess-2');

      expect(status1!.onboarded).toBe(true);
      expect(status1!.triggersFired).toContain('first_tool_use');
      expect(status2!.onboarded).toBe(false);
      expect(status2!.triggersFired).toHaveLength(0);
    });
  });
});
