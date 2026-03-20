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

export interface ToolContext {
  sessionId: string;
  modelId: string;
  workingDirectory: string;
}
