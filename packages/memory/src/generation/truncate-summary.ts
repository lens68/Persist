import { resolveMemoryPolicy, type MemoryPolicyConfig } from '../constants/config.js';

export function truncateSummary(content: string, policy?: MemoryPolicyConfig): string {
  const { summaryMaxChars } = resolveMemoryPolicy(policy);
  if (content.length <= summaryMaxChars) return content;
  return content.slice(0, summaryMaxChars);
}
