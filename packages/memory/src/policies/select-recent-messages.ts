import type { ChatMessage, Message } from '@persist/shared';
import { resolveMemoryPolicy, type MemoryPolicyConfig } from '../constants/config.js';

export function messageToChatMessage(message: Message): ChatMessage {
  const msg: ChatMessage = { role: message.role, content: message.content };
  if (message.toolCallId !== undefined) msg.toolCallId = message.toolCallId;
  if (message.toolName !== undefined) msg.toolName = message.toolName;
  if (message.role === 'assistant' && message.providerMetadata?.toolCalls) {
    msg.toolCalls = message.providerMetadata.toolCalls;
  }
  return msg;
}

export function messagesToChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map(messageToChatMessage);
}

/**
 * IC-MEM-05 — recent K from chronological messages (after user append, before assistant).
 */
export function selectRecentMessages(
  messages: Message[],
  policy?: MemoryPolicyConfig,
): ChatMessage[] {
  const { injectionRecentK } = resolveMemoryPolicy(policy);
  return messagesToChatMessages(messages.slice(-injectionRecentK));
}
