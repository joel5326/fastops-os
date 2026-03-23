import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { ProductLoader } from '../products/loader.js';
import type { ProductRegistration } from '../products/types.js';

const TEST_DIR = join(process.cwd(), '.test-product-loader');

function createTestRepo(id: string, opts?: { missions?: string[]; domainContext?: string }) {
  const repoPath = join(TEST_DIR, id);
  mkdirSync(join(repoPath, 'missions'), { recursive: true });
  mkdirSync(join(repoPath, 'context', 'identity'), { recursive: true });
  mkdirSync(join(repoPath, 'src'), { recursive: true });

  writeFileSync(
    join(repoPath, 'fastops.config.json'),
    JSON.stringify({
      product: id,
      name: `Test Product ${id}`,
      version: '1.0',
      engine: {
        contextDir: 'context/',
        missionsDir: 'missions/',
        deliverablesDir: 'deliverables/',
        debriefsDir: 'debriefs/',
      },
      onboarding: opts?.domainContext
        ? { domainContext: 'context/domain.md', maxTokens: 5000 }
        : undefined,
    }),
  );

  if (opts?.domainContext) {
    writeFileSync(join(repoPath, 'context', 'domain.md'), opts.domainContext);
  }

  for (const mission of opts?.missions ?? []) {
    mkdirSync(join(repoPath, 'missions', mission), { recursive: true });
    writeFileSync(
      join(repoPath, 'missions', mission, 'MISSION.md'),
      `---\nname: ${mission}\nstatus: open\npriority: 2\n---\n\n# ${mission}\n\nMission description.`,
    );
  }

  return repoPath;
}

describe('ProductLoader', () => {
  let loader: ProductLoader;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    loader = new ProductLoader();
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('registers a product from fastops.config.json', () => {
    const repoPath = createTestRepo('alpha', { missions: ['bug-fixes', 'feature-x'] });

    const reg: ProductRegistration = {
      id: 'alpha',
      name: 'Alpha',
      repoPath,
      missionsDir: 'missions/',
      contextDir: 'context/',
      active: true,
    };

    const loaded = loader.registerProduct(reg);

    expect(loaded.config.product).toBe('alpha');
    expect(loaded.config.name).toBe('Test Product alpha');
    expect(loaded.missions).toHaveLength(2);
    expect(loaded.missions.map((m) => m.name).sort()).toEqual(['bug-fixes', 'feature-x']);
  });

  it('throws when repo path does not exist', () => {
    const reg: ProductRegistration = {
      id: 'ghost',
      name: 'Ghost',
      repoPath: join(TEST_DIR, 'nonexistent'),
      missionsDir: 'missions/',
      contextDir: 'context/',
      active: true,
    };

    expect(() => loader.registerProduct(reg)).toThrow('Product repo not found');
  });

  it('throws when fastops.config.json is missing', () => {
    const repoPath = join(TEST_DIR, 'no-config');
    mkdirSync(repoPath, { recursive: true });

    const reg: ProductRegistration = {
      id: 'no-config',
      name: 'No Config',
      repoPath,
      missionsDir: 'missions/',
      contextDir: 'context/',
      active: true,
    };

    expect(() => loader.registerProduct(reg)).toThrow('No fastops.config.json');
  });

  it('lists all products', () => {
    createTestRepo('one');
    createTestRepo('two');

    loader.registerProduct({ id: 'one', name: 'One', repoPath: join(TEST_DIR, 'one'), missionsDir: 'missions/', contextDir: 'context/', active: true });
    loader.registerProduct({ id: 'two', name: 'Two', repoPath: join(TEST_DIR, 'two'), missionsDir: 'missions/', contextDir: 'context/', active: false });

    expect(loader.listProducts()).toHaveLength(2);
    expect(loader.listActiveProducts()).toHaveLength(1);
    expect(loader.listActiveProducts()[0].registration.id).toBe('one');
  });

  it('discovers missions from directory structure', () => {
    createTestRepo('with-missions', {
      missions: ['security-audit', 'performance', 'ux-overhaul'],
    });

    const loaded = loader.registerProduct({
      id: 'with-missions',
      name: 'With Missions',
      repoPath: join(TEST_DIR, 'with-missions'),
      missionsDir: 'missions/',
      contextDir: 'context/',
      active: true,
    });

    expect(loaded.missions).toHaveLength(3);
    expect(loaded.missions[0].productId).toBe('with-missions');
    expect(loaded.missions[0].id).toMatch(/^with-missions\//);
    expect(loaded.missions[0].status).toBe('open');
    expect(loaded.missions[0].priority).toBe('2');
  });

  it('loads domain context from product config', () => {
    createTestRepo('with-domain', {
      domainContext: '# WarriorPath Domain\n\nThis is a training platform for Navy SEAL candidates.',
    });

    const loaded = loader.registerProduct({
      id: 'with-domain',
      name: 'With Domain',
      repoPath: join(TEST_DIR, 'with-domain'),
      missionsDir: 'missions/',
      contextDir: 'context/',
      active: true,
    });

    expect(loaded.domainContext).toContain('WarriorPath Domain');
  });

  it('builds product context layer', () => {
    createTestRepo('ctx-test', {
      missions: ['m1', 'm2'],
      domainContext: '# Test Domain\n\nSome domain info.',
    });

    loader.registerProduct({
      id: 'ctx-test',
      name: 'Context Test',
      repoPath: join(TEST_DIR, 'ctx-test'),
      missionsDir: 'missions/',
      contextDir: 'context/',
      active: true,
    });

    const layer = loader.buildProductContextLayer('ctx-test');

    expect(layer).not.toBeNull();
    expect(layer!.text).toContain('Test Product ctx-test');
    expect(layer!.text).toContain('Test Domain');
    expect(layer!.text).toContain('Product Missions');
    expect(layer!.tokens).toBeGreaterThan(0);
    expect(layer!.productId).toBe('ctx-test');
  });

  it('returns null context layer for unknown product', () => {
    expect(loader.buildProductContextLayer('unknown')).toBeNull();
  });

  it('aggregates missions across all products', () => {
    createTestRepo('p1', { missions: ['a', 'b'] });
    createTestRepo('p2', { missions: ['c'] });

    loader.registerProduct({ id: 'p1', name: 'P1', repoPath: join(TEST_DIR, 'p1'), missionsDir: 'missions/', contextDir: 'context/', active: true });
    loader.registerProduct({ id: 'p2', name: 'P2', repoPath: join(TEST_DIR, 'p2'), missionsDir: 'missions/', contextDir: 'context/', active: true });

    expect(loader.getAllMissions()).toHaveLength(3);
  });

  it('reloads a product', () => {
    const repoPath = createTestRepo('reload-me', { missions: ['initial'] });

    loader.registerProduct({
      id: 'reload-me',
      name: 'Reload',
      repoPath,
      missionsDir: 'missions/',
      contextDir: 'context/',
      active: true,
    });

    expect(loader.getProductMissions('reload-me')).toHaveLength(1);

    mkdirSync(join(repoPath, 'missions', 'new-mission'), { recursive: true });
    writeFileSync(
      join(repoPath, 'missions', 'new-mission', 'MISSION.md'),
      '---\nname: new-mission\nstatus: open\npriority: 1\n---\n\n# New Mission',
    );

    const reloaded = loader.reloadProduct('reload-me');
    expect(reloaded).not.toBeNull();
    expect(reloaded!.missions).toHaveLength(2);
  });

  it('unregisters a product', () => {
    createTestRepo('remove-me');

    loader.registerProduct({
      id: 'remove-me',
      name: 'Remove',
      repoPath: join(TEST_DIR, 'remove-me'),
      missionsDir: 'missions/',
      contextDir: 'context/',
      active: true,
    });

    expect(loader.listProducts()).toHaveLength(1);
    expect(loader.unregisterProduct('remove-me')).toBe(true);
    expect(loader.listProducts()).toHaveLength(0);
  });
});
