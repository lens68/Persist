import type { MemoryEntry, MemoryGenerationInput, Message } from '@persist/shared';

export type ResolveGenerationParams = {
  sessionId: string;
  activeSummary?: MemoryEntry | null;
  /** Incremental tail — typically unsummarized Message[] with ids (IC-MEM-02). */
  messages: Message[];
};

/**
 * IC-MEM-02 — incremental compression input (not entire session history).
 */
export function resolveUnsummarizedMessages(
  messages: Message[],
  activeSummary: MemoryEntry | null,
): Message[] {
  if (!activeSummary) {
    return [...messages];
  }
  if (activeSummary.sourceMessageIds?.length) {
    const covered = new Set(activeSummary.sourceMessageIds);
    return messages.filter((m) => !covered.has(m.id));
  }
  // Summary without source ids: tail = messages after summary artifact time (IC-MEM-02).
  return messages.filter((m) => m.createdAt > activeSummary.createdAt);
}

export function resolveGenerationInput(params: ResolveGenerationParams): MemoryGenerationInput {
  const activeSummary = params.activeSummary ?? null;
  const unsummarizedMessages = resolveUnsummarizedMessages(params.messages, activeSummary);
  return {
    sessionId: params.sessionId,
    activeSummary,
    unsummarizedMessages,
    sourceMessageIds: unsummarizedMessages.map((m) => m.id),
  };
}
