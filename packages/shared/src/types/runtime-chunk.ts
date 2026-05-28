import { z } from 'zod';
import { ProviderMetadataSchema, TokenUsageSchema } from './provider-metadata.js';
import { MemoryEntrySchema, MemoryInjectionSnapshotSchema } from './memory.js';
import { ExecutionPlanSchema } from './plan.js';

const BaseChunkSchema = z.object({
  sessionId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
  timestamp: z.coerce.date(),
});

export const TextDeltaChunkSchema = BaseChunkSchema.extend({
  type: z.literal('text-delta'),
  delta: z.string(),
});

export const MessageStartChunkSchema = BaseChunkSchema.extend({
  type: z.literal('message-start'),
  role: z.enum(['assistant']),
  messageId: z.string().uuid(),
});

export const MessageEndChunkSchema = BaseChunkSchema.extend({
  type: z.literal('message-end'),
  messageId: z.string().uuid(),
  content: z.string(),
});

export const UsageChunkSchema = BaseChunkSchema.extend({
  type: z.literal('usage'),
  usage: TokenUsageSchema,
  messageId: z.string().uuid().optional(),
});

export const ErrorChunkSchema = BaseChunkSchema.extend({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean().optional(),
});

export const DoneChunkSchema = BaseChunkSchema.extend({
  type: z.literal('done'),
  messageId: z.string().uuid().optional(),
  completionState: z.enum(['completed', 'failed', 'aborted']),
  providerMetadata: ProviderMetadataSchema.optional(),
});

export const ToolCallStartChunkSchema = BaseChunkSchema.extend({
  type: z.literal('tool-call-start'),
  toolCallId: z.string(),
  toolName: z.string(),
  arguments: z.string(),
});

export const ToolCallEndChunkSchema = BaseChunkSchema.extend({
  type: z.literal('tool-call-end'),
  toolCallId: z.string(),
  toolName: z.string(),
  arguments: z.string(),
});

export const ToolResultChunkSchema = BaseChunkSchema.extend({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  messageId: z.string().uuid(),
  success: z.boolean(),
});

/** Observability: runtime injected continuity before provider.chat (FR-MEM-11). */
export const MemoryInjectedChunkSchema = BaseChunkSchema.extend({
  type: z.literal('memory-injected'),
  snapshot: MemoryInjectionSnapshotSchema,
});

/** Observability: new summary persisted after generation (FR-MEM-12). */
export const MemoryGeneratedChunkSchema = BaseChunkSchema.extend({
  type: z.literal('memory-generated'),
  memory: MemoryEntrySchema,
});

/** Observability: multiple tool_calls truncated to first (IC-TOOL-06). */
export const ToolCallTruncatedChunkSchema = BaseChunkSchema.extend({
  type: z.literal('tool-call-truncated'),
  requestedCount: z.number().int().positive(),
  executedToolCallId: z.string(),
});

/** Observability: tool payload truncated (IC-TOOL-12). */
export const ToolPayloadTruncatedChunkSchema = BaseChunkSchema.extend({
  type: z.literal('tool-payload-truncated'),
  field: z.enum(['toolInput', 'toolOutput']),
  originalLength: z.number().int().positive(),
  maxLength: z.number().int().positive(),
});

/** Observability: plan persisted after generation (v0.4). */
export const PlanGeneratedChunkSchema = BaseChunkSchema.extend({
  type: z.literal('plan-generated'),
  planSnapshotId: z.string().uuid(),
  plan: ExecutionPlanSchema,
});

/** Observability: plan validation failed — synthetic response-only path (v0.4). */
export const PlanInvalidChunkSchema = BaseChunkSchema.extend({
  type: z.literal('plan-invalid'),
  planSnapshotId: z.string().uuid(),
  reason: z.string(),
});

export const PlanStepStartChunkSchema = BaseChunkSchema.extend({
  type: z.literal('plan-step-start'),
  planSnapshotId: z.string().uuid(),
  stepId: z.string(),
  stepType: z.enum(['tool', 'response']),
});

export const PlanStepEndChunkSchema = BaseChunkSchema.extend({
  type: z.literal('plan-step-end'),
  planSnapshotId: z.string().uuid(),
  stepId: z.string(),
  stepType: z.enum(['tool', 'response']),
  status: z.enum(['completed', 'truncated', 'skipped']),
});

export const PlanStepTruncatedChunkSchema = BaseChunkSchema.extend({
  type: z.literal('plan-step-truncated'),
  planSnapshotId: z.string().uuid(),
  stepId: z.string(),
  reason: z.string(),
});

export const ExecutionChunkSchema = z.discriminatedUnion('type', [
  TextDeltaChunkSchema,
  MessageStartChunkSchema,
  MessageEndChunkSchema,
  UsageChunkSchema,
  ErrorChunkSchema,
  DoneChunkSchema,
  ToolCallStartChunkSchema,
  ToolCallEndChunkSchema,
  ToolResultChunkSchema,
]);

export const ObservabilityChunkSchema = z.discriminatedUnion('type', [
  MemoryInjectedChunkSchema,
  MemoryGeneratedChunkSchema,
  ToolCallTruncatedChunkSchema,
  ToolPayloadTruncatedChunkSchema,
  PlanGeneratedChunkSchema,
  PlanInvalidChunkSchema,
  PlanStepStartChunkSchema,
  PlanStepEndChunkSchema,
  PlanStepTruncatedChunkSchema,
]);

export const RuntimeChunkSchema = z.discriminatedUnion('type', [
  TextDeltaChunkSchema,
  MessageStartChunkSchema,
  MessageEndChunkSchema,
  UsageChunkSchema,
  ErrorChunkSchema,
  DoneChunkSchema,
  ToolCallStartChunkSchema,
  ToolCallEndChunkSchema,
  ToolResultChunkSchema,
  MemoryInjectedChunkSchema,
  MemoryGeneratedChunkSchema,
  ToolCallTruncatedChunkSchema,
  ToolPayloadTruncatedChunkSchema,
  PlanGeneratedChunkSchema,
  PlanInvalidChunkSchema,
  PlanStepStartChunkSchema,
  PlanStepEndChunkSchema,
  PlanStepTruncatedChunkSchema,
]);

export type RuntimeChunk = z.infer<typeof RuntimeChunkSchema>;
export type TextDeltaChunk = z.infer<typeof TextDeltaChunkSchema>;
export type MessageStartChunk = z.infer<typeof MessageStartChunkSchema>;
export type MessageEndChunk = z.infer<typeof MessageEndChunkSchema>;
export type UsageChunk = z.infer<typeof UsageChunkSchema>;
export type ErrorChunk = z.infer<typeof ErrorChunkSchema>;
export type DoneChunk = z.infer<typeof DoneChunkSchema>;
export type ToolCallStartChunk = z.infer<typeof ToolCallStartChunkSchema>;
export type ToolCallEndChunk = z.infer<typeof ToolCallEndChunkSchema>;
export type ToolResultChunk = z.infer<typeof ToolResultChunkSchema>;
export type MemoryInjectedChunk = z.infer<typeof MemoryInjectedChunkSchema>;
export type MemoryGeneratedChunk = z.infer<typeof MemoryGeneratedChunkSchema>;
export type ToolCallTruncatedChunk = z.infer<typeof ToolCallTruncatedChunkSchema>;
export type ToolPayloadTruncatedChunk = z.infer<typeof ToolPayloadTruncatedChunkSchema>;
export type PlanGeneratedChunk = z.infer<typeof PlanGeneratedChunkSchema>;
export type PlanInvalidChunk = z.infer<typeof PlanInvalidChunkSchema>;
export type PlanStepStartChunk = z.infer<typeof PlanStepStartChunkSchema>;
export type PlanStepEndChunk = z.infer<typeof PlanStepEndChunkSchema>;
export type PlanStepTruncatedChunk = z.infer<typeof PlanStepTruncatedChunkSchema>;
export type ExecutionChunk = z.infer<typeof ExecutionChunkSchema>;
export type ObservabilityChunk = z.infer<typeof ObservabilityChunkSchema>;

export const OBSERVABILITY_CHUNK_TYPES = [
  'memory-injected',
  'memory-generated',
  'tool-call-truncated',
  'tool-payload-truncated',
  'plan-generated',
  'plan-invalid',
  'plan-step-start',
  'plan-step-end',
  'plan-step-truncated',
] as const;

export type ObservabilityChunkType = (typeof OBSERVABILITY_CHUNK_TYPES)[number];

export function isObservabilityChunk(chunk: RuntimeChunk): chunk is ObservabilityChunk {
  return (OBSERVABILITY_CHUNK_TYPES as readonly string[]).includes(chunk.type);
}

export function isExecutionChunk(chunk: RuntimeChunk): chunk is ExecutionChunk {
  return !isObservabilityChunk(chunk);
}
