import type { Message } from '../types/message.js';
import type { RuntimeChunk } from '../types/runtime-chunk.js';

/** Minimal message shape for provider context (runtime → provider). */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

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
