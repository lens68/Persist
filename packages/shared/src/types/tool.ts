import { z } from 'zod';

/** OpenAI Function Calling subset (IC-TOOL-08). */
export const JsonSchemaSchema = z.record(z.unknown());

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: JsonSchemaSchema,
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const ToolExecutionContextSchema = z.object({
  sessionId: z.string().uuid(),
  triggerMessageId: z.string().uuid(),
});

export type ToolExecutionContext = z.infer<typeof ToolExecutionContextSchema> & {
  signal?: AbortSignal;
};

export const ToolResultSchema = z.object({
  success: z.boolean(),
  output: z.unknown(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ToolExecutionStatusSchema = z.enum(['completed', 'failed', 'timeout']);

export type ToolExecutionStatus = z.infer<typeof ToolExecutionStatusSchema>;

export const ToolExecutionSnapshotSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  triggerMessageId: z.string().uuid(),
  toolName: z.string(),
  toolInput: z.unknown(),
  toolOutput: z.unknown(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date(),
  status: ToolExecutionStatusSchema,
  payloadTruncated: z.boolean().optional(),
});

export type ToolExecutionSnapshot = z.infer<typeof ToolExecutionSnapshotSchema>;

export const CreateToolExecutionSnapshotInputSchema = ToolExecutionSnapshotSchema.omit({
  id: true,
}).extend({
  id: z.string().uuid().optional(),
});

export type CreateToolExecutionSnapshotInput = z.infer<
  typeof CreateToolExecutionSnapshotInputSchema
>;

/** CFG-TOOL defaults (frozen for v0.3). */
export const TOOL_RUNTIME_DEFAULTS = {
  maxToolCallsPerTurn: 1,
  toolTimeoutMs: 30_000,
  maxRegisteredTools: 16,
  maxPayloadChars: 64_000,
} as const;
