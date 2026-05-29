import { z } from 'zod';
import { MessageSchema } from './message.js';
import { MemoryEntrySchema, MemoryInjectionSnapshotSchema } from './memory.js';
import { PlanSnapshotSchema } from './plan.js';
import { ToolExecutionSnapshotSchema } from './tool.js';

export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().nullable().optional(),
  title: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Session = z.infer<typeof SessionSchema>;

export const CreateSessionInputSchema = z.object({
  title: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  userId: z.string().nullable().optional(),
});

export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

/** Session with messages for replay / context build. */
export const SessionWithMessagesSchema = SessionSchema.extend({
  messages: z.array(MessageSchema),
});

export type SessionWithMessages = z.infer<typeof SessionWithMessagesSchema>;

/** Replay payload — historical reconstruction only (FR-MEM-09). */
export const SessionReplaySchema = z.object({
  session: SessionSchema,
  messages: z.array(MessageSchema),
  memories: z.array(MemoryEntrySchema).default([]),
  injectionSnapshots: z.array(MemoryInjectionSnapshotSchema).default([]),
  toolExecutionSnapshots: z.array(ToolExecutionSnapshotSchema).default([]),
  planSnapshots: z.array(PlanSnapshotSchema).default([]),
  reconstructedAt: z.coerce.date(),
});

export type SessionReplay = z.infer<typeof SessionReplaySchema>;

/** CFG-HISTORY-02 — first user message preview truncation for Sidebar title. */
export const SESSION_PREVIEW_TEXT_MAX_LENGTH = 24;

/** Lightweight session row for workspace list (no messages). */
export const SessionSummarySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  messageCount: z.number().int().nonnegative(),
  previewText: z.string().optional(),
});

export type SessionSummary = z.infer<typeof SessionSummarySchema>;
