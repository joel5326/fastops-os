import { join, resolve } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { estimateTokens } from '../context/token-counter.js';
import type {
  ProductRegistration,
  ProductConfig,
  ProductMission,
  ProductContextLayer,
  LoadedProduct,
} from './types.js';

export class ProductLoader {
  private products = new Map<string, LoadedProduct>();

  registerProduct(registration: ProductRegistration): LoadedProduct {
    const repoPath = resolve(registration.repoPath);

    if (!existsSync(repoPath)) {
      throw new Error(`Product repo not found: ${repoPath}`);
    }

    const config = this.loadConfig(repoPath);

    if (registration.id !== config.product) {
      throw new Error(`Product registration ID mismatch: '${registration.id}' does not match config product '${config.product}'`);
    }

    const missionsDir = config.engine.missionsDir || registration.missionsDir;
    const contextDir = config.engine.contextDir || registration.contextDir;

    const missions = this.discoverMissions(
      registration.id,
      join(repoPath, missionsDir),
    );
    const domainContext = this.loadDomainContext(repoPath, config);

    const loaded: LoadedProduct = {
      registration: { 
        ...registration, 
        repoPath,
        missionsDir,
        contextDir,
        deliverablesDir: config.engine.deliverablesDir || registration.deliverablesDir,
        debriefsDir: config.engine.debriefsDir || registration.debriefsDir
      },
      config,
      missions,
      domainContext,
    };

    this.products.set(registration.id, loaded);
    return loaded;
  }

  private loadConfig(repoPath: string): ProductConfig {
    const configPath = join(repoPath, 'fastops.config.json');

    if (!existsSync(configPath)) {
      throw new Error(
        `No fastops.config.json found in ${repoPath}. ` +
        `Mission repos must register with the engine via this file.`,
      );
    }

    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as ProductConfig;

    if (!parsed.product || !parsed.name || !parsed.engine) {
      throw new Error(
        `Invalid fastops.config.json in ${repoPath}: ` +
        `requires product, name, and engine fields.`,
      );
    }

    return parsed;
  }

  private discoverMissions(productId: string, missionsDir: string): ProductMission[] {
    if (!existsSync(missionsDir)) return [];

    const missions: ProductMission[] = [];

    const walk = (dir: string, prefix: string) => {
      if (!existsSync(dir)) return;
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const missionFile = join(dir, entry.name, 'MISSION.md');
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          
          if (existsSync(missionFile)) {
            const content = readFileSync(missionFile, 'utf-8');
            const parsed = this.parseMissionFrontmatter(content);
            missions.push({
              id: `${productId}/${relPath}`,
              productId,
              name: parsed.name || entry.name,
              status: parsed.status || 'open',
              priority: parsed.priority ?? 3,
              owner: parsed.owner,
              filePath: missionFile,
            });
          }
          
          walk(join(dir, entry.name), relPath);
        }
      }
    };

    walk(missionsDir, '');

    return missions;
  }

  private parseMissionFrontmatter(content: string): Record<string, any> {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};

    const result: Record<string, any> = {};
    const lines = match[1].split(/\r?\n/);

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      result[key] = value;
    }

    return result;
  }

  private loadDomainContext(repoPath: string, config: ProductConfig): string | undefined {
    if (!config.onboarding?.domainContext) return undefined;

    const contextPath = join(repoPath, config.onboarding.domainContext);
    if (!existsSync(contextPath)) return undefined;

    const content = readFileSync(contextPath, 'utf-8');
    const maxTokens = config.onboarding.maxTokens ?? 5000;
    const tokens = estimateTokens(content);

    if (tokens > maxTokens) {
      const ratio = maxTokens / tokens;
      const truncatedLength = Math.floor(content.length * ratio);
      return content.slice(0, truncatedLength) + '\n\n[Domain context truncated to fit token budget]';
    }

    return content;
  }

  buildProductContextLayer(productId: string, modelId?: string): ProductContextLayer | null {
    const product = this.products.get(productId);
    if (!product) return null;

    const parts: string[] = [];

    parts.push(`## Active Product: ${product.config.name} (${product.config.product} v${product.config.version})`);

    if (product.domainContext) {
      parts.push('### Domain Context');
      parts.push(product.domainContext);
    }

    if (modelId) {
      const modelContextPath = join(
        product.registration.repoPath,
        product.registration.contextDir,
        'identity',
        `${modelId}.md`,
      );
      if (existsSync(modelContextPath)) {
        const modelContext = readFileSync(modelContextPath, 'utf-8');
        parts.push(`### ${modelId} — Product-Specific Context`);
        parts.push(modelContext);
      }
    }

    const activeMissions = product.missions.filter((m) => m.status !== 'done');
    if (activeMissions.length > 0) {
      parts.push('### Product Missions');
      for (const m of activeMissions) {
        const ownerTag = m.owner ? ` (${m.owner})` : '';
        parts.push(`- [${m.status.toUpperCase()}] ${m.name}${ownerTag}`);
      }
    }

    const text = parts.join('\n\n');
    return {
      text,
      tokens: estimateTokens(text),
      productId,
    };
  }

  getProduct(id: string): LoadedProduct | undefined {
    return this.products.get(id);
  }

  listProducts(): LoadedProduct[] {
    return Array.from(this.products.values());
  }

  listActiveProducts(): LoadedProduct[] {
    return this.listProducts().filter((p) => p.registration.active);
  }

  getProductMissions(productId: string): ProductMission[] {
    return this.products.get(productId)?.missions ?? [];
  }

  getAllMissions(): ProductMission[] {
    const all: ProductMission[] = [];
    for (const product of this.products.values()) {
      all.push(...product.missions);
    }
    return all;
  }

  reloadProduct(productId: string): LoadedProduct | null {
    const existing = this.products.get(productId);
    if (!existing) return null;
    return this.registerProduct(existing.registration);
  }

  unregisterProduct(productId: string): boolean {
    return this.products.delete(productId);
  }
}
