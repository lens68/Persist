import type { GeneratedMemorySummary, MemoryGenerationInput, MemoryGenerator } from '@persist/shared';
import { truncateSummary } from './truncate-summary.js';

/**
 * Deterministic summary for tests / CI / fallback (FR-MEM-07).
 * Does not call any ChatProvider.
 */
export class RuleBasedMemoryGenerator implements MemoryGenerator {
  readonly id = 'rule-based';

  async generateSummary(input: MemoryGenerationInput): Promise<GeneratedMemorySummary> {
    const parts: string[] = [];
    if (input.activeSummary) {
      parts.push(input.activeSummary.content);
    }
    for (const m of input.unsummarizedMessages) {
      parts.push(`${m.role}: ${m.content}`);
    }
    const content = truncateSummary(parts.join('\n'));
    return {
      type: 'summary',
      content,
      sourceMessageIds: input.sourceMessageIds,
      metadata: { generatorId: this.id },
    };
  }
}
