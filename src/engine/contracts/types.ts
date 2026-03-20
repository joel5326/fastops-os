export type ContractStatus =
  | 'OPEN' | 'CLAIMED' | 'IN_PROGRESS' | 'BUILT'
  | 'QC_REVIEW' | 'QC_FAIL' | 'QC_PASS'
  | 'VALIDATION' | 'VALIDATION_FAIL' | 'DONE'
  | 'BLOCKED';

export interface Contract {
  id: string;
  name: string;
  status: ContractStatus;
  wave: number;
  claimedBy?: string;
  qcBy?: string;
  validatedBy?: string;
  dependencies: string[];
  blocks: string[];
  spec: string;
  acceptanceCriteria: string[];
  artifacts: string[];
  auditTrail: AuditEntry[];
  claimedAt?: string;
  claimTimeoutMs: number;
}

export interface AuditEntry {
  ts: string;
  action: string;
  model: string;
  from: ContractStatus;
  to: ContractStatus;
  reason?: string;
}

export interface ClaimResult {
  success: boolean;
  contractId: string;
  claimedBy?: string;
  reason?: string;
}

export interface QCResult {
  pass: boolean;
  findings: string[];
  failures?: string[];
  model: string;
  evidence?: string[];
}

export interface ValidationResult {
  pass: boolean;
  evidence: string[];
  model: string;
  notes?: string;
}

export interface QCAssignment {
  contractId: string;
  assignedTo: string;
  checklist: string[];
}
