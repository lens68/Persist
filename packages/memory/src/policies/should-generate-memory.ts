import { resolveMemoryPolicy, type MemoryPolicyConfig } from '../constants/config.js';

/** CFG-MEM-01 — message-count threshold only (no tokenizer in v0.2). */
export function shouldGenerateMemory(
  messageCount: number,
  policy?: MemoryPolicyConfig,
): boolean {
  const { generationMessageThreshold } = resolveMemoryPolicy(policy);
  return messageCount >= generationMessageThreshold;
}
