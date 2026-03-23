import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CompactionArtifactStore } from '../compaction-artifact-store.js';
import type { CompactionArtifact } from '../../compaction/types.js';

describe('CompactionArtifactStore', () => {
  const testDir = path.join(__dirname, 'test-artifacts');
  let store: CompactionArtifactStore;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    store = new CompactionArtifactStore({ baseDir: testDir });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  const createMockArtifact = (id: string, sessionId: string): CompactionArtifact => ({
    id,
    sessionId,
    timestamp: new Date().toISOString(),
    trigger: { type: 'PERCENT', at: 85 },
    contextStats: {
      totalTokens: 100000,
      totalItems: 500,
      byType: {},
      byTier: { verbatim: 10, weight: 20, discard: 470 }
    },
    verbatim: [],
    weight: {
      source: 'INFERRED',
      timestamp: new Date().toISOString(),
      compressedTokens: 500,
      rawTokens: 5000
    },
    discard: ['msg-1', 'msg-2'],
    resumePrompt: 'Resume context',
    tokensReclaimed: 4500,
    compressionRatio: 0.1
  });

  it('should create the base directory', () => {
    expect(fs.existsSync(testDir)).toBe(true);
  });

  it('should save a compaction artifact', () => {
    const artifact = createMockArtifact('art-1', 'session-1');
    store.save(artifact);

    const filePath = path.join(testDir, 'session-1.jsonl');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.id).toBe('art-1');
    expect(parsed.sessionId).toBe('session-1');
  });

  it('should load multiple artifacts for a session chronologically', () => {
    const art1 = createMockArtifact('art-1', 'session-2');
    const art2 = createMockArtifact('art-2', 'session-2');
    
    store.save(art1);
    store.save(art2);

    const loaded = store.loadForSession('session-2');
    expect(loaded.length).toBe(2);
    expect(loaded[0].id).toBe('art-1');
    expect(loaded[1].id).toBe('art-2');
  });

  it('should return empty array if no artifacts exist', () => {
    const loaded = store.loadForSession('non-existent-session');
    expect(loaded.length).toBe(0);
  });

  it('should get the latest artifact', () => {
    const art1 = createMockArtifact('art-1', 'session-3');
    const art2 = createMockArtifact('art-2', 'session-3');
    
    store.save(art1);
    store.save(art2);

    const latest = store.getLatest('session-3');
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe('art-2');
  });
});
