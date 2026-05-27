import type { ChatMessage } from '@persist/shared';

/** IC-MEM-01 — sole legal entry for continuity summary injection. */
export const CONTINUITY_SUMMARY_PREFIX = 'Previous runtime continuity summary: ';

export function buildMemorySystemMessage(summaryContent: string): ChatMessage {
  return {
    role: 'system',
    content: `${CONTINUITY_SUMMARY_PREFIX}${summaryContent}`,
  };
}
