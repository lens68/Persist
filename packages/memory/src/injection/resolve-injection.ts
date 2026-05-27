import type { ChatMessage, MemoryEntry, MemoryInjectionSnapshot } from '@persist/shared';
import { buildMemorySystemMessage } from './build-memory-system-message.js';
import { createInjectionSnapshot } from './create-injection-snapshot.js';

export type ResolveInjectionParams = {
  sessionId: string;
  triggerMessageId: string;
  activeSummary?: MemoryEntry | null;
  /** Recent K window (IC-MEM-05); must include trigger user turn. */
  recentMessages: ChatMessage[];
};

export type ResolveInjectionResult = {
  resolvedMessages: ChatMessage[];
  snapshot: MemoryInjectionSnapshot;
};

/**
 * Core v0.2 continuity function — bounded context for provider input (FR-MEM-02).
 */
export function resolveInjection(params: ResolveInjectionParams): ResolveInjectionResult {
  const injectedMemoryIds: string[] = [];
  const resolvedMessages: ChatMessage[] = [];

  if (params.activeSummary) {
    resolvedMessages.push(buildMemorySystemMessage(params.activeSummary.content));
    injectedMemoryIds.push(params.activeSummary.id);
  }

  resolvedMessages.push(...params.recentMessages);

  const snapshot = createInjectionSnapshot({
    sessionId: params.sessionId,
    triggerMessageId: params.triggerMessageId,
    injectedMemoryIds,
    resolvedMessages,
    strategy: 'summary_plus_recent_k',
  });

  return { resolvedMessages, snapshot };
}
