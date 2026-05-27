/** Runtime continuity policy defaults (CFG-MEM). */
export const DEFAULT_MEMORY_POLICY = {
  generationMessageThreshold: 8,
  injectionRecentK: 6,
  summaryMaxChars: 2000,
} as const;

export type MemoryPolicyConfig = {
  generationMessageThreshold?: number;
  injectionRecentK?: number;
  summaryMaxChars?: number;
};

export function resolveMemoryPolicy(config?: MemoryPolicyConfig) {
  return {
    generationMessageThreshold:
      config?.generationMessageThreshold ?? DEFAULT_MEMORY_POLICY.generationMessageThreshold,
    injectionRecentK: config?.injectionRecentK ?? DEFAULT_MEMORY_POLICY.injectionRecentK,
    summaryMaxChars: config?.summaryMaxChars ?? DEFAULT_MEMORY_POLICY.summaryMaxChars,
  };
}
