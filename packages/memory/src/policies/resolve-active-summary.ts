import type { MemoryEntry } from '@persist/shared';

export function isActiveSummary(entry: MemoryEntry): boolean {
  return entry.type === 'summary' && entry.supersededBy === undefined;
}

/**
 * FR-MEM-03 — at most one logical Active Summary; picks latest by createdAt if storage anomaly.
 */
export function resolveActiveSummary(memories: MemoryEntry[]): MemoryEntry | null {
  const active = memories.filter(isActiveSummary);
  if (active.length === 0) return null;
  return active.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
}

/** @deprecated Use resolveActiveSummary */
export const selectActiveSummary = resolveActiveSummary;
