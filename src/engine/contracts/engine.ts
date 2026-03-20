import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { Contract, ContractStatus, AuditEntry, ClaimResult, QCResult, QCAssignment, ValidationResult } from './types.js';
import { isValidTransition } from './lifecycle.js';
import { areDependenciesMet, getReadyContracts, getBlockedContracts, detectCircularDependencies } from './dependency.js';
import { assignQC, assignValidator } from './assignment.js';

export class ContractEngine {
  private contracts: Contract[] = [];
  private statePath: string;
  private activeAssignments = new Map<string, number>();

  constructor(statePath: string) {
    this.statePath = statePath;
    this.loadState();
  }

  loadContracts(contracts: Contract[]): void {
    const cycles = detectCircularDependencies(contracts);
    if (cycles.length > 0) {
      throw new Error(`Circular dependencies detected: ${cycles.map((c) => c.join(' → ')).join('; ')}`);
    }

    for (const incoming of contracts) {
      const existing = this.contracts.find((c) => c.id === incoming.id);
      if (existing) {
        existing.spec = incoming.spec;
        existing.acceptanceCriteria = incoming.acceptanceCriteria;
        existing.dependencies = incoming.dependencies;
        existing.blocks = incoming.blocks;
      } else {
        this.contracts.push(incoming);
      }
    }

    this.persistState();
  }

  getContract(id: string): Contract | undefined {
    return this.contracts.find((c) => c.id === id);
  }

  listContracts(filter?: { status?: ContractStatus; wave?: number }): Contract[] {
    let result = [...this.contracts];
    if (filter?.status) result = result.filter((c) => c.status === filter.status);
    if (filter?.wave) result = result.filter((c) => c.wave === filter.wave);
    return result;
  }

  claim(contractId: string, modelId: string): ClaimResult {
    const contract = this.contracts.find((c) => c.id === contractId);
    if (!contract) {
      return { success: false, contractId, reason: `Contract not found: ${contractId}` };
    }

    if (contract.status !== 'OPEN') {
      return { success: false, contractId, claimedBy: contract.claimedBy, reason: `Contract is ${contract.status}, not OPEN` };
    }

    if (!areDependenciesMet(contract, this.contracts)) {
      const unmet = contract.dependencies.filter((d) => {
        const dep = this.contracts.find((c) => c.id === d);
        return !dep || dep.status !== 'DONE';
      });
      return { success: false, contractId, reason: `Unmet dependencies: ${unmet.join(', ')}` };
    }

    this.transition(contract, 'CLAIMED', modelId, 'Contract claimed');
    contract.claimedBy = modelId;
    contract.claimedAt = new Date().toISOString();

    this.incrementAssignment(modelId);
    this.persistState();

    return { success: true, contractId, claimedBy: modelId };
  }

  startWork(contractId: string, modelId: string): void {
    const contract = this.getOrThrow(contractId);
    if (contract.claimedBy !== modelId) {
      throw new Error(`Model ${modelId} has not claimed ${contractId}`);
    }
    this.transition(contract, 'IN_PROGRESS', modelId, 'Work started');
    this.persistState();
  }

  reportBuilt(contractId: string, modelId: string, artifacts: string[]): void {
    const contract = this.getOrThrow(contractId);
    if (contract.claimedBy !== modelId) {
      throw new Error(`Model ${modelId} is not the builder of ${contractId}`);
    }
    contract.artifacts = artifacts;
    this.transition(contract, 'BUILT', modelId, `Build complete. Artifacts: ${artifacts.join(', ')}`);
    this.persistState();
  }

  assignQCModel(contractId: string, availableModels: string[]): QCAssignment | null {
    const contract = this.getOrThrow(contractId);
    if (contract.status !== 'BUILT') {
      throw new Error(`Cannot assign QC: ${contractId} is ${contract.status}, not BUILT`);
    }

    const qcModel = assignQC(contract, availableModels, this.activeAssignments);
    if (!qcModel) return null;

    contract.qcBy = qcModel;
    this.transition(contract, 'QC_REVIEW', qcModel, `QC assigned to ${qcModel}`);
    this.incrementAssignment(qcModel);
    this.persistState();

    return {
      contractId,
      assignedTo: qcModel,
      checklist: contract.acceptanceCriteria,
    };
  }

  reportQC(contractId: string, result: QCResult): void {
    const contract = this.getOrThrow(contractId);
    if (contract.status !== 'QC_REVIEW') {
      throw new Error(`Cannot report QC: ${contractId} is ${contract.status}`);
    }

    if (result.pass) {
      this.transition(contract, 'QC_PASS', result.model, `QC PASS: ${result.findings.join(', ')}`);
    } else {
      this.transition(contract, 'QC_FAIL', result.model, `QC FAIL: ${result.failures?.join(', ')}`);
      this.transition(contract, 'IN_PROGRESS', contract.claimedBy ?? 'unknown', 'Returned to builder after QC failure');
    }

    this.persistState();
  }

  assignValidatorModel(contractId: string, availableModels: string[]): string | null {
    const contract = this.getOrThrow(contractId);
    if (contract.status !== 'QC_PASS') {
      throw new Error(`Cannot assign validator: ${contractId} is ${contract.status}`);
    }

    const validator = assignValidator(contract, availableModels, this.activeAssignments);
    if (!validator) return null;

    contract.validatedBy = validator;
    this.transition(contract, 'VALIDATION', validator, `Validation assigned to ${validator}`);
    this.incrementAssignment(validator);
    this.persistState();

    return validator;
  }

  reportValidation(contractId: string, result: ValidationResult): void {
    const contract = this.getOrThrow(contractId);
    if (contract.status !== 'VALIDATION') {
      throw new Error(`Cannot report validation: ${contractId} is ${contract.status}`);
    }

    if (result.evidence.length === 0) {
      throw new Error('Validation requires evidence. Provide screenshots, curl output, or test results.');
    }

    if (result.pass) {
      this.transition(contract, 'DONE', result.model, `Validation PASS. Evidence: ${result.evidence.join(', ')}`);
    } else {
      this.transition(contract, 'VALIDATION_FAIL', result.model, `Validation FAIL: ${result.notes}`);
      this.transition(contract, 'IN_PROGRESS', contract.claimedBy ?? 'unknown', 'Returned to builder after validation failure');
    }

    this.persistState();
  }

  markDone(contractId: string, modelId: string, reason: string = 'Marked done'): void {
    const contract = this.getOrThrow(contractId);
    this.transition(contract, 'DONE', modelId, reason);
    this.persistState();
  }

  getReady(): Contract[] {
    return getReadyContracts(this.contracts);
  }

  getBlocked(): Contract[] {
    return getBlockedContracts(this.contracts);
  }

  getAuditTrail(contractId: string): AuditEntry[] {
    const contract = this.getOrThrow(contractId);
    return contract.auditTrail;
  }

  private getOrThrow(id: string): Contract {
    const contract = this.contracts.find((c) => c.id === id);
    if (!contract) throw new Error(`Contract not found: ${id}`);
    return contract;
  }

  private transition(contract: Contract, to: ContractStatus, model: string, reason: string): void {
    const from = contract.status;
    if (!isValidTransition(from, to)) {
      throw new Error(`Invalid transition: ${contract.id} from ${from} to ${to}`);
    }

    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      action: `${from} → ${to}`,
      model,
      from,
      to,
      reason,
    };

    contract.auditTrail.push(entry);
    contract.status = to;
  }

  private incrementAssignment(modelId: string): void {
    this.activeAssignments.set(modelId, (this.activeAssignments.get(modelId) ?? 0) + 1);
  }

  private persistState(): void {
    const dir = dirname(this.statePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(this.contracts, null, 2), 'utf8');
  }

  private loadState(): void {
    if (!existsSync(this.statePath)) return;
    try {
      const raw = readFileSync(this.statePath, 'utf8');
      this.contracts = JSON.parse(raw);
    } catch {
      // corrupt state — start fresh
    }
  }
}
