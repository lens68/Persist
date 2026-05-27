import type { Message } from '../types/message.js';
import type { ChatMessage } from '../types/chat-message.js';
import type { RuntimeChunk } from '../types/runtime-chunk.js';

export type { ChatMessage } from '../types/chat-message.js';
export { ChatMessageSchema } from '../types/chat-message.js';

export interface ChatRequest {
  sessionId: string;
  messages: ChatMessage[];
  model?: string;
  signal?: AbortSignal;
}

/**
 * Vendor-agnostic chat provider.
 * Implementations live in packages/provider only.
 */
export interface ChatProvider {
  readonly id: string;
  chat(request: ChatRequest): AsyncIterable<RuntimeChunk>;
}

/** Map persisted runtime messages to provider context. */
export function toChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}
