import type { ContractStatus } from './types.js';

const VALID_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  'OPEN': ['CLAIMED', 'BLOCKED'],
  'CLAIMED': ['IN_PROGRESS', 'OPEN'],
  'IN_PROGRESS': ['BUILT', 'OPEN'],
  'BUILT': ['QC_REVIEW'],
  'QC_REVIEW': ['QC_PASS', 'QC_FAIL'],
  'QC_FAIL': ['IN_PROGRESS'],
  'QC_PASS': ['VALIDATION', 'DONE'],
  'VALIDATION': ['DONE', 'VALIDATION_FAIL'],
  'VALIDATION_FAIL': ['IN_PROGRESS'],
  'DONE': [],
  'BLOCKED': ['OPEN'],
};

export function isValidTransition(from: ContractStatus, to: ContractStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canBypassValidation(contract: { wave: number }): boolean {
  return contract.wave <= 1;
}

export function requiresQC(from: ContractStatus, to: ContractStatus): boolean {
  if (from === 'BUILT' && to === 'DONE') return true;
  return false;
}
