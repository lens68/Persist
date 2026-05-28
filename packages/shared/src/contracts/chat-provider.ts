import type { Message } from '../types/message.js';
import type { ChatMessage } from '../types/chat-message.js';
import type { ToolDefinition } from '../types/tool.js';
import type { RuntimeChunk } from '../types/runtime-chunk.js';

export type { ChatMessage } from '../types/chat-message.js';
export { ChatMessageSchema } from '../types/chat-message.js';

export interface ChatRequest {
  sessionId: string;
  messages: ChatMessage[];
  model?: string;
  signal?: AbortSignal;
  tools?: ToolDefinition[];
}

/**
 * Vendor-agnostic chat provider.
 * Implementations live in packages/provider only.
 */
export interface ChatProvider {
  readonly id: string;
  chat(request: ChatRequest): AsyncIterable<RuntimeChunk>;
}

function messageToChatMessage(m: Message): ChatMessage {
  const msg: ChatMessage = { role: m.role, content: m.content };
  if (m.toolCallId !== undefined) msg.toolCallId = m.toolCallId;
  if (m.toolName !== undefined) msg.toolName = m.toolName;
  if (m.role === 'assistant' && m.providerMetadata?.toolCalls) {
    msg.toolCalls = m.providerMetadata.toolCalls;
  }
  return msg;
}

/** Map persisted runtime messages to provider context. */
export function toChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map(messageToChatMessage);
}
