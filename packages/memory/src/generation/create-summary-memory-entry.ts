import type { CreateMemoryEntryInput, GeneratedMemorySummary } from '@persist/shared';

export function createSummaryMemoryEntryInput(
  sessionId: string,
  generated: GeneratedMemorySummary,
): CreateMemoryEntryInput {
  return {
    sessionId,
    type: 'summary',
    content: generated.content,
    sourceMessageIds: generated.sourceMessageIds,
    metadata: generated.metadata,
  };
}
