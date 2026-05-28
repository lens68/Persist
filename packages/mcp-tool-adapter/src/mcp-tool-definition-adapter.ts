import type { ToolDefinition } from '@persist/shared';

/** MCP tool descriptor (integration layer). */
export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Map MCP tool metadata to runtime ToolDefinition (IC-TOOL-08). */
export function mcpToolToDefinition(tool: McpToolDescriptor): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description ?? tool.name,
    inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
  };
}

export function mcpToolsToDefinitions(tools: McpToolDescriptor[]): ToolDefinition[] {
  return tools.map(mcpToolToDefinition);
}
