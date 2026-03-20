import type { Contract } from './types.js';

const ARCHITECTURE_FAMILIES: Record<string, string> = {
  'claude': 'anthropic',
  'haiku': 'anthropic',
  'gpt': 'openai',
  'gemini': 'google',
  'kimi': 'moonshot',
  'grok': 'xai',
};

export function assignQC(
  contract: Contract,
  availableModels: string[],
  activeAssignments: Map<string, number>,
): string | null {
  const builder = contract.claimedBy;
  if (!builder) return null;

  const builderFamily = ARCHITECTURE_FAMILIES[builder] ?? builder;

  const candidates = availableModels
    .filter((m) => m !== builder)
    .sort((a, b) => {
      const aFamily = ARCHITECTURE_FAMILIES[a] ?? a;
      const bFamily = ARCHITECTURE_FAMILIES[b] ?? b;
      const aCross = aFamily !== builderFamily ? 1 : 0;
      const bCross = bFamily !== builderFamily ? 1 : 0;
      if (aCross !== bCross) return bCross - aCross;

      const aLoad = activeAssignments.get(a) ?? 0;
      const bLoad = activeAssignments.get(b) ?? 0;
      return aLoad - bLoad;
    });

  return candidates[0] ?? null;
}

export function assignValidator(
  contract: Contract,
  availableModels: string[],
  activeAssignments: Map<string, number>,
): string | null {
  const builder = contract.claimedBy;
  const qc = contract.qcBy;

  const candidates = availableModels
    .filter((m) => m !== builder && m !== qc)
    .sort((a, b) => {
      const aLoad = activeAssignments.get(a) ?? 0;
      const bLoad = activeAssignments.get(b) ?? 0;
      return aLoad - bLoad;
    });

  return candidates[0] ?? null;
}
