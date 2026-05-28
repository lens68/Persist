import { z } from 'zod';
import { ToolCallMetadataSchema } from './provider-metadata.js';

/** Minimal message shape for provider context and injection snapshots. */
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  /** Assistant FC metadata for provider #2 context (IC-TOOL-11). */
  toolCalls: z.array(ToolCallMetadataSchema).optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
