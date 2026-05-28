import { z } from 'zod';

/** Token usage from provider (normalized). */
export const TokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const ToolCallMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.string(),
});

export type ToolCallMetadata = z.infer<typeof ToolCallMetadataSchema>;

/** Normalized provider metadata for Runtime Replay. */
export const ProviderMetadataSchema = z.object({
  requestId: z.string().optional(),
  model: z.string().optional(),
  finishReason: z.string().optional(),
  usage: TokenUsageSchema.optional(),
  latencyMs: z.number().nonnegative().optional(),
  /** Function calling intents from provider #1 (IC-TOOL-11). */
  toolCalls: z.array(ToolCallMetadataSchema).optional(),
  /** Debug-only; not retained long-term by default. */
  raw: z.record(z.unknown()).nullable().optional(),
});

export type ProviderMetadata = z.infer<typeof ProviderMetadataSchema>;
