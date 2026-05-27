import type {
  CreateMemoryEntryInput,
  MemoryEntry,
} from '../types/memory.js';

/**
 * Continuity artifact persistence port (FR-MEM-01, NFR-MEM-02).
 * Implementations live in packages/storage only.
 */
export interface MemoryStore {
  appendMemory(sessionId: string, input: CreateMemoryEntryInput): Promise<MemoryEntry>;

  listMemories(sessionId: string): Promise<MemoryEntry[]>;

  /** Active Summary: latest summary without supersededBy (FR-MEM-03). */
  getActiveSummary(sessionId: string): Promise<MemoryEntry | null>;

  /**
   * Mark a summary as superseded (FR-MEM-04).
   * IC-MEM-03: implementations SHOULD combine with append in one transaction
   * via {@link replaceActiveSummary} when generating a new summary.
   */
  supersedeMemory(memoryId: string, supersededBy: string): Promise<MemoryEntry>;

  /**
   * Atomically persist a new summary and supersede the previous Active Summary (IC-MEM-03).
   * @param previousMemoryId null when no prior active summary exists.
   */
  replaceActiveSummary(
    sessionId: string,
    input: CreateMemoryEntryInput,
    previousMemoryId: string | null,
  ): Promise<MemoryEntry>;
}
