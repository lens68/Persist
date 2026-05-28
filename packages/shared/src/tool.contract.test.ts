import { describe, expect, it } from 'vitest';
import {
  ChatMessageSchema,
  ProviderMetadataSchema,
  RuntimeChunkSchema,
  SessionReplaySchema,
  ToolDefinitionSchema,
  ToolExecutionSnapshotSchema,
  ToolResultSchema,
  isObservabilityChunk,
  TOOL_RUNTIME_DEFAULTS,
} from './index.js';

describe('tool contracts (v0.3)', () => {
  it('validates ToolDefinition (IC-TOOL-08)', () => {
    const def = ToolDefinitionSchema.parse({
      name: 'query_sales',
      description: 'Query sales metrics',
      inputSchema: {
        type: 'object',
        properties: { metric: { type: 'string' }, period: { type: 'string' } },
        required: ['metric', 'period'],
      },
    });
    expect(def.name).toBe('query_sales');
  });

  it('validates ToolResult (IC-TOOL-01)', () => {
    const ok = ToolResultSchema.parse({ success: true, output: { rows: [] } });
    const fail = ToolResultSchema.parse({
      success: false,
      output: null,
      error: { code: 'timeout', message: 'Tool timed out' },
    });
    expect(ok.success).toBe(true);
    expect(fail.error?.code).toBe('timeout');
  });

  it('validates ToolExecutionSnapshot (IC-TOOL-03)', () => {
    const snap = ToolExecutionSnapshotSchema.parse({
      id: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      triggerMessageId: crypto.randomUUID(),
      toolName: 'query_sales',
      toolInput: { metric: 'revenue', period: '2024-01' },
      toolOutput: { product: 'Widget A' },
      startedAt: new Date(),
      completedAt: new Date(),
      status: 'completed',
    });
    expect(snap.status).toBe('completed');
  });

  it('validates ChatMessage with tool fields (IC-TOOL-02)', () => {
    const msg = ChatMessageSchema.parse({
      role: 'tool',
      content: '{"product":"A"}',
      toolCallId: 'call_abc',
      toolName: 'query_sales',
    });
    expect(msg.toolCallId).toBe('call_abc');
  });

  it('validates ProviderMetadata.toolCalls (IC-TOOL-11)', () => {
    const meta = ProviderMetadataSchema.parse({
      toolCalls: [{ id: 'call_1', name: 'query_sales', arguments: '{"metric":"revenue"}' }],
    });
    expect(meta.toolCalls).toHaveLength(1);
  });

  it('validates tool execution RuntimeChunks (FR-TOOL-12/13)', () => {
    const sessionId = crypto.randomUUID();
    const ts = new Date();
    const chunks = [
      {
        type: 'tool-call-start',
        sessionId,
        timestamp: ts,
        toolCallId: 'c1',
        toolName: 'query_sales',
        arguments: '{}',
      },
      {
        type: 'tool-result',
        sessionId,
        timestamp: ts,
        toolCallId: 'c1',
        toolName: 'query_sales',
        messageId: crypto.randomUUID(),
        success: true,
      },
      {
        type: 'tool-call-truncated',
        sessionId,
        timestamp: ts,
        requestedCount: 2,
        executedToolCallId: 'c1',
      },
      {
        type: 'tool-payload-truncated',
        sessionId,
        timestamp: ts,
        field: 'toolOutput',
        originalLength: 100_000,
        maxLength: TOOL_RUNTIME_DEFAULTS.maxPayloadChars,
      },
    ];
    for (const c of chunks) {
      expect(RuntimeChunkSchema.parse(c)).toBeDefined();
    }
  });

  it('classifies observability vs execution chunks', () => {
    const sessionId = crypto.randomUUID();
    const ts = new Date();
    expect(
      isObservabilityChunk({
        type: 'tool-call-truncated',
        sessionId,
        timestamp: ts,
        requestedCount: 2,
        executedToolCallId: 'c1',
      }),
    ).toBe(true);
    expect(
      isObservabilityChunk({
        type: 'tool-result',
        sessionId,
        timestamp: ts,
        toolCallId: 'c1',
        toolName: 'query_sales',
        messageId: crypto.randomUUID(),
        success: true,
      }),
    ).toBe(false);
  });

  it('validates SessionReplay with toolExecutionSnapshots (FR-TOOL-11)', () => {
    const sessionId = crypto.randomUUID();
    const replay = SessionReplaySchema.parse({
      session: {
        id: sessionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      messages: [],
      memories: [],
      injectionSnapshots: [],
      toolExecutionSnapshots: [
        {
          id: crypto.randomUUID(),
          sessionId,
          triggerMessageId: crypto.randomUUID(),
          toolName: 'query_sales',
          toolInput: {},
          toolOutput: {},
          startedAt: new Date(),
          completedAt: new Date(),
          status: 'completed',
        },
      ],
      reconstructedAt: new Date(),
    });
    expect(replay.toolExecutionSnapshots).toHaveLength(1);
  });
});
