import { z } from 'zod';

/** Minimal message shape for provider context and injection snapshots. */
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
