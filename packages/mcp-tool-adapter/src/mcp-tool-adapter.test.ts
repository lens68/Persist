import { describe, expect, it } from 'vitest';
import { McpToolExecutor } from './mcp-tool-executor.js';
import { mcpToolToDefinition } from './mcp-tool-definition-adapter.js';

describe('McpToolExecutor', () => {
  it('calls MCP client and maps success (FR-TOOL-15)', async () => {
    const executor = new McpToolExecutor({
      async callTool(name, args) {
        expect(name).toBe('query_sales');
        expect(args).toEqual({ metric: 'revenue' });
        return { content: { ok: true } };
      },
    });

    const result = await executor.call(
      'query_sales',
      { metric: 'revenue' },
      { sessionId: crypto.randomUUID(), triggerMessageId: crypto.randomUUID() },
    );
    expect(result.success).toBe(true);
  });

  it('maps MCP error flag to ToolResult failure', async () => {
    const executor = new McpToolExecutor({
      async callTool() {
        return { content: 'bad', isError: true };
      },
    });
    const result = await executor.call(
      'x',
      {},
      { sessionId: crypto.randomUUID(), triggerMessageId: crypto.randomUUID() },
    );
    expect(result.success).toBe(false);
  });
});

describe('mcpToolToDefinition', () => {
  it('maps MCP tool to ToolDefinition (IC-TOOL-08)', () => {
    const def = mcpToolToDefinition({
      name: 'query_sales',
      description: 'Sales',
      inputSchema: { type: 'object' },
    });
    expect(def.name).toBe('query_sales');
    expect(def.inputSchema).toEqual({ type: 'object' });
  });
});
