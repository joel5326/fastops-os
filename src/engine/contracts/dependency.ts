import type { Contract } from './types.js';

export function areDependenciesMet(contract: Contract, allContracts: Contract[]): boolean {
  if (contract.dependencies.length === 0) return true;

  for (const depId of contract.dependencies) {
    const dep = allContracts.find((c) => c.id === depId);
    if (!dep || dep.status !== 'DONE') return false;
  }

  return true;
}

export function getReadyContracts(contracts: Contract[]): Contract[] {
  return contracts.filter(
    (c) => c.status === 'OPEN' && areDependenciesMet(c, contracts),
  );
}

export function getBlockedContracts(contracts: Contract[]): Contract[] {
  return contracts.filter(
    (c) => c.status === 'OPEN' && !areDependenciesMet(c, contracts),
  );
}

export function detectCircularDependencies(contracts: Contract[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string, path: string[]): void {
    if (inStack.has(id)) {
      const cycleStart = path.indexOf(id);
      cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(id)) return;

    visited.add(id);
    inStack.add(id);
    path.push(id);

    const contract = contracts.find((c) => c.id === id);
    if (contract) {
      for (const dep of contract.dependencies) {
        dfs(dep, [...path]);
      }
    }

    inStack.delete(id);
  }

  for (const contract of contracts) {
    dfs(contract.id, []);
  }

  return cycles;
}
