import type { MemoryEntry, Message } from '@persist/shared';
import type { MemoryPolicyConfig } from '../constants/config.js';
import { resolveInjection, type ResolveInjectionResult } from '../injection/resolve-injection.js';
import { selectRecentMessages } from '../policies/select-recent-messages.js';

export type PerformMemoryInjectionParams = {
  sessionId: string;
  triggerMessageId: string;
  messages: Message[];
  activeSummary?: MemoryEntry | null;
  policy?: MemoryPolicyConfig;
};

/**
 * Pure injection orchestration (§9 steps 3–6 semantics, no I/O).
 */
export function performMemoryInjection(
  params: PerformMemoryInjectionParams,
): ResolveInjectionResult {
  const recentMessages = selectRecentMessages(params.messages, params.policy);
  return resolveInjection({
    sessionId: params.sessionId,
    triggerMessageId: params.triggerMessageId,
    activeSummary: params.activeSummary ?? null,
    recentMessages,
  });
}
