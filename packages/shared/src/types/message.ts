import { z } from 'zod';
import { ProviderMetadataSchema } from './provider-metadata.js';

export const MessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const StreamCompletionStateSchema = z.enum([
  'pending',
  'streaming',
  'completed',
  'failed',
  'aborted',
]);

export type StreamCompletionState = z.infer<typeof StreamCompletionStateSchema>;

/**
 * Message is a runtime artifact (not a UI chat bubble).
 * Includes execution observability fields.
 */
export const MessageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.string(),
  providerMetadata: ProviderMetadataSchema.optional(),
  completionState: StreamCompletionStateSchema.default('completed'),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
});

export type Message = z.infer<typeof MessageSchema>;

/** Input for creating a message before persistence assigns id/timestamps. */
export const CreateMessageInputSchema = z.object({
  id: z.string().uuid().optional(),
  role: MessageRoleSchema,
  content: z.string(),
  completionState: StreamCompletionStateSchema.optional(),
  providerMetadata: ProviderMetadataSchema.optional(),
});

export type CreateMessageInput = z.infer<typeof CreateMessageInputSchema>;
