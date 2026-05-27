import { z } from 'zod';
import { ProviderMetadataSchema, TokenUsageSchema } from './provider-metadata.js';

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

export const RuntimeChunkSchema = z.discriminatedUnion('type', [
  TextDeltaChunkSchema,
  MessageStartChunkSchema,
  MessageEndChunkSchema,
  UsageChunkSchema,
  ErrorChunkSchema,
  DoneChunkSchema,
]);

export type RuntimeChunk = z.infer<typeof RuntimeChunkSchema>;
export type TextDeltaChunk = z.infer<typeof TextDeltaChunkSchema>;
export type MessageStartChunk = z.infer<typeof MessageStartChunkSchema>;
export type MessageEndChunk = z.infer<typeof MessageEndChunkSchema>;
export type UsageChunk = z.infer<typeof UsageChunkSchema>;
export type ErrorChunk = z.infer<typeof ErrorChunkSchema>;
export type DoneChunk = z.infer<typeof DoneChunkSchema>;
