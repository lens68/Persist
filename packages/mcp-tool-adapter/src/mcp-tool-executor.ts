import type { ToolExecutionContext, ToolExecutor, ToolResult } from '@persist/shared';

export interface McpToolCallResult {
  content: unknown;
  isError?: boolean;
}

/** Minimal MCP client surface for tool execution (integration). */
export interface McpToolCallClient {
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
}

/**
 * ToolExecutor backed by an MCP client (FR-TOOL-15).
 * MCP SDK wiring lives in apps/api; this package stays SDK-agnostic.
 */
export class McpToolExecutor implements ToolExecutor {
  constructor(private readonly client: McpToolCallClient) {}

  async call(
    toolName: string,
    input: unknown,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const args =
        input && typeof input === 'object' && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : { value: input };
      const response = await this.client.callTool(toolName, args);
      if (response.isError) {
        return {
          success: false,
          output: response.content,
          error: { code: 'mcp_tool_error', message: String(response.content) },
        };
      }
      return { success: true, output: response.content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: null,
        error: { code: 'mcp_call_failed', message },
      };
    }
  }
}
