import type { ToolCallRequest, ToolResult, ToolHandler, ToolContext, ToolDefinition } from './types.js';

export class ToolExecutor {
  private handlers = new Map<string, ToolHandler>();
  private definitions = new Map<string, ToolDefinition>();
  private permissions = new Map<string, Set<string>>();

  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.definitions.set(definition.name, definition);
    this.handlers.set(definition.name, handler);
  }

  setPermissions(modelId: string, allowedTools: string[]): void {
    this.permissions.set(modelId, new Set(allowedTools));
  }

  getDefinitions(modelId?: string): ToolDefinition[] {
    const all = Array.from(this.definitions.values());
    if (!modelId) return all;

    const allowed = this.permissions.get(modelId);
    if (!allowed) return all;

    return all.filter((d) => allowed.has(d.name));
  }

  async execute(call: ToolCallRequest, context: ToolContext): Promise<ToolResult> {
    const handler = this.handlers.get(call.name);
    if (!handler) {
      return {
        toolCallId: call.id,
        name: call.name,
        output: `Error: Unknown tool '${call.name}'. Available tools: ${Array.from(this.handlers.keys()).join(', ')}`,
        isError: true,
      };
    }

    const allowed = this.permissions.get(context.modelId);
    if (allowed && !allowed.has(call.name)) {
      return {
        toolCallId: call.id,
        name: call.name,
        output: `Permission denied: Model '${context.modelId}' does not have access to tool '${call.name}'. Allowed tools: ${Array.from(allowed).join(', ')}`,
        isError: true,
      };
    }

    try {
      const args = JSON.parse(call.arguments);
      const output = await handler(args, context);
      return {
        toolCallId: call.id,
        name: call.name,
        output,
        isError: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        toolCallId: call.id,
        name: call.name,
        output: `Error executing tool '${call.name}': ${message}`,
        isError: true,
      };
    }
  }
}
