export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  output: string;
  isError: boolean;
}

export type ToolHandler = (args: Record<string, unknown>, context: ToolContext) => Promise<string>;

export type EngineSecurityTier = 'development' | 'enterprise';

export interface ToolContext {
  sessionId: string;
  modelId: string;
  /** Session cwd for relative paths (usually same as sandbox root). */
  workingDirectory: string;
  /** Hard boundary: no read/write/exec outside this directory tree. */
  sandboxRoot: string;
  /** FASTOPS_SECURITY_TIER — enterprise blocks unrestricted bash unless break-glass. */
  securityTier?: EngineSecurityTier;
  /** FASTOPS_BASH_ALLOW_ELEVATED=1 — allow unrestricted bash in enterprise. */
  allowElevatedBash?: boolean;
  /** Append-only tool audit JSONL directory (e.g. .fastops-engine/audit). */
  toolAuditDir?: string;
}
