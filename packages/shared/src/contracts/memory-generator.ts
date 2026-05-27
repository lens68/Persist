import type { Message } from '../types/message.js';
import type { MemoryEntry } from '../types/memory.js';

/**
 * Input for incremental summary generation (IC-MEM-02).
 * MUST NOT include entire session history.
 */
export interface MemoryGenerationInput {
  sessionId: string;
  activeSummary: MemoryEntry | null;
  /** Messages not yet covered by active summary (the "tail"). */
  unsummarizedMessages: Message[];
  sourceMessageIds: string[];
}

/** Output before persistence assigns id / createdAt / sessionId. */
export interface GeneratedMemorySummary {
  type: 'summary';
  content: string;
  sourceMessageIds: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Summary generation port (FR-MEM-06, FR-MEM-07).
 * Implementations may call ChatProvider directly — MUST NOT call executeChat.
 */
export interface MemoryGenerator {
  readonly id: string;
  generateSummary(input: MemoryGenerationInput): Promise<GeneratedMemorySummary>;
}
