import { z } from 'zod';
import { ChatMessageSchema } from './chat-message.js';

/** Runtime Continuity Memory artifact kinds (v0.2: summary only). */
export const MemoryEntryTypeSchema = z.literal('summary');
export type MemoryEntryType = z.infer<typeof MemoryEntryTypeSchema>;

/**
 * Persisted Runtime Continuity Memory artifact.
 * Not chat history, not retrieval index, not agent state.
 */
export const MemoryEntrySchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  type: MemoryEntryTypeSchema,
  content: z.string(),
  sourceMessageIds: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.coerce.date(),
  /** When set, this entry is no longer an Active Summary. */
  supersededBy: z.string().uuid().optional(),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const CreateMemoryEntryInputSchema = MemoryEntrySchema.omit({
  id: true,
  createdAt: true,
}).extend({
  id: z.string().uuid().optional(),
});

export type CreateMemoryEntryInput = z.infer<typeof CreateMemoryEntryInputSchema>;

export const MemoryInjectionStrategySchema = z.literal('summary_plus_recent_k');
export type MemoryInjectionStrategy = z.infer<typeof MemoryInjectionStrategySchema>;

/**
 * Immutable audit record: what the model saw for a single user-turn execution.
 * Anchored to triggerMessageId (IC-MEM-06).
 */
export const MemoryInjectionSnapshotSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  triggerMessageId: z.string().uuid(),
  injectedMemoryIds: z.array(z.string().uuid()),
  resolvedMessages: z.array(ChatMessageSchema),
  strategy: MemoryInjectionStrategySchema,
  createdAt: z.coerce.date(),
});

export type MemoryInjectionSnapshot = z.infer<typeof MemoryInjectionSnapshotSchema>;

export const CreateMemoryInjectionSnapshotInputSchema = MemoryInjectionSnapshotSchema.omit({
  id: true,
  createdAt: true,
});

export type CreateMemoryInjectionSnapshotInput = z.infer<
  typeof CreateMemoryInjectionSnapshotInputSchema
>;

/** Loaded continuity state for injection / generation policy. */
export const MemoryContextSchema = z.object({
  activeSummary: MemoryEntrySchema.nullable(),
  memories: z.array(MemoryEntrySchema),
});

export type MemoryContext = z.infer<typeof MemoryContextSchema>;
