import type {
  CreateMemoryInjectionSnapshotInput,
  MemoryInjectionSnapshot,
} from '../types/memory.js';

/**
 * Execution audit persistence for injection (FR-MEM-08, FR-MEM-10).
 * Separate from MemoryEntry store — snapshots are not continuity artifacts.
 */
export interface InjectionSnapshotStore {
  appendInjectionSnapshot(
    sessionId: string,
    input: CreateMemoryInjectionSnapshotInput,
  ): Promise<MemoryInjectionSnapshot>;

  listInjectionSnapshots(sessionId: string): Promise<MemoryInjectionSnapshot[]>;
}
