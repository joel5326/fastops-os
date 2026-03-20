import { estimateTokens } from '../token-counter.js';

export interface ContractSpec {
  id: string;
  name: string;
  type: string;
  specification: string;
  acceptanceCriteria: string[];
  inputArtifacts?: string[];
  constraints?: string[];
}

export interface TaskContext {
  text: string;
  tokens: number;
}

export function buildTaskLayer(
  contract: ContractSpec | undefined,
  maxTokens?: number,
): TaskContext {
  if (!contract) {
    return { text: '', tokens: 0 };
  }

  const parts: string[] = [
    `[ACTIVE CONTRACT: ${contract.id}]`,
    `Name: ${contract.name}`,
    `Type: ${contract.type}`,
    '',
    'Specification:',
    contract.specification,
    '',
    'Acceptance Criteria:',
    ...contract.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`),
  ];

  if (contract.constraints?.length) {
    parts.push('', 'Constraints:');
    parts.push(...contract.constraints.map((c) => `  - ${c}`));
  }

  let text = parts.join('\n');

  if (maxTokens && estimateTokens(text) > maxTokens) {
    const specTokens = estimateTokens(contract.specification);
    if (specTokens > maxTokens * 0.6) {
      const truncated = contract.specification.slice(0, maxTokens * 0.6 * 4);
      const truncParts = [
        `[ACTIVE CONTRACT: ${contract.id}]`,
        `Name: ${contract.name}`,
        `Type: ${contract.type}`,
        '',
        'Specification (truncated):',
        truncated,
        '... [truncated for context budget]',
        '',
        'Acceptance Criteria:',
        ...contract.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`),
      ];
      text = truncParts.join('\n');
    }
  }

  return { text, tokens: estimateTokens(text) };
}
