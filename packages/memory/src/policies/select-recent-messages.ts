import type { ChatMessage, Message } from '@persist/shared';
import { resolveMemoryPolicy, type MemoryPolicyConfig } from '../constants/config.js';

export function messageToChatMessage(message: Message): ChatMessage {
  return { role: message.role, content: message.content };
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
