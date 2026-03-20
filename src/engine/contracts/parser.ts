import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Contract } from './types.js';

export function parseContractFile(filePath: string): Contract | null {
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, 'utf8');

  const idMatch = content.match(/^#\s*Contract:\s*(\S+)/m);
  if (!idMatch) return null;

  const id = idMatch[1];
  const name = id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const statusMatch = content.match(/State:\s*(\w+)/);
  const status = statusMatch ? statusMatch[1].toUpperCase() : 'OPEN';

  const waveMatch = content.match(/Wave:\s*(\d+)/i);
  const wave = waveMatch ? parseInt(waveMatch[1]) : 1;

  const requiresMatch = content.match(/Requires:\s*(.+)/i);
  const dependencies: string[] = [];
  if (requiresMatch) {
    const deps = requiresMatch[1].match(/FOS-\d+/g);
    if (deps) dependencies.push(...deps);
  }

  const blocksMatch = content.match(/Blocks:\s*(.+)/i);
  const blocks: string[] = [];
  if (blocksMatch) {
    const blks = blocksMatch[1].match(/FOS-\d+/g);
    if (blks) blocks.push(...blks);
  }

  const criteria: string[] = [];
  const criteriaSection = content.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n## |$)/);
  if (criteriaSection) {
    const lines = criteriaSection[1].split('\n');
    for (const line of lines) {
      const match = line.match(/- \[[ x]\]\s*(.+)/);
      if (match) criteria.push(match[1].trim());
    }
  }

  const specSection = content.match(/## Specification\n([\s\S]*?)(?=\n## Acceptance|$)/);
  const spec = specSection ? specSection[1].trim() : '';

  return {
    id,
    name,
    status: status as Contract['status'],
    wave,
    dependencies,
    blocks,
    spec,
    acceptanceCriteria: criteria,
    artifacts: [],
    auditTrail: [],
    claimTimeoutMs: 20 * 60 * 1000,
  };
}

export function loadContractsFromDir(dir: string): Contract[] {
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('README') && !f.startsWith('VISION'));
  const contracts: Contract[] = [];

  for (const file of files) {
    const contract = parseContractFile(join(dir, file));
    if (contract) contracts.push(contract);
  }

  return contracts;
}
