import type { ToolExecutionContext, ToolResult } from '../types/tool.js';

/** Port for external tool execution (IC-TOOL-01). */
export interface ToolExecutor {
  call(toolName: string, input: unknown, context: ToolExecutionContext): Promise<ToolResult>;
}
