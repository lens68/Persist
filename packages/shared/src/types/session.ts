import { z } from 'zod';
import { MessageSchema } from './message.js';

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

/** Replay payload — historical reconstruction only. */
export const SessionReplaySchema = z.object({
  session: SessionSchema,
  messages: z.array(MessageSchema),
  reconstructedAt: z.coerce.date(),
});

export type SessionReplay = z.infer<typeof SessionReplaySchema>;
