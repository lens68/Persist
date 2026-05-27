import type { CreateMemoryInjectionSnapshotInput, MemoryInjectionSnapshot } from '@persist/shared';

export function createInjectionSnapshot(
  input: CreateMemoryInjectionSnapshotInput,
): MemoryInjectionSnapshot {
  return {
    id: crypto.randomUUID(),
    ...input,
    createdAt: new Date(),
  };
}
