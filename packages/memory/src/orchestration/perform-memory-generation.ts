import type { MemoryEntry, MemoryGenerationInput, Message } from '@persist/shared';
import type { MemoryPolicyConfig } from '../constants/config.js';
import { resolveGenerationInput } from '../generation/resolve-generation-input.js';
import { shouldGenerateMemory } from '../policies/should-generate-memory.js';

export type MemoryGenerationPlan = {
  shouldGenerate: boolean;
  input: MemoryGenerationInput | null;
};

/**
 * Pure generation planning (§9 steps 11–12, no provider / no I/O).
 */
export function planMemoryGeneration(params: {
  sessionId: string;
  messages: Message[];
  activeSummary?: MemoryEntry | null;
  policy?: MemoryPolicyConfig;
}): MemoryGenerationPlan {
  const shouldGenerate = shouldGenerateMemory(params.messages.length, params.policy);
  if (!shouldGenerate) {
    return { shouldGenerate: false, input: null };
  }
  return {
    shouldGenerate: true,
    input: resolveGenerationInput({
      sessionId: params.sessionId,
      messages: params.messages,
      activeSummary: params.activeSummary ?? null,
    }),
  };
}

/** @deprecated Use planMemoryGeneration */
export const performMemoryGeneration = planMemoryGeneration;
