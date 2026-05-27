import type {
  ChatProvider,
  GeneratedMemorySummary,
  MemoryGenerationInput,
  MemoryGenerator,
} from '@persist/shared';
import { buildSummaryPromptMessages, truncateSummary } from '@persist/memory';

/**
 * LLM summary via ChatProvider.chat() only — never executeChat (FR-MEM-06).
 */
export class LlmSummaryMemoryGenerator implements MemoryGenerator {
  readonly id = 'llm-summary';

  constructor(
    private readonly provider: ChatProvider,
    private readonly options?: { model?: string },
  ) {}

  async generateSummary(input: MemoryGenerationInput): Promise<GeneratedMemorySummary> {
    const messages = buildSummaryPromptMessages(input);
    let content = '';

    for await (const chunk of this.provider.chat({
      sessionId: input.sessionId,
      messages,
      model: this.options?.model,
    })) {
      if (chunk.type === 'text-delta') {
        content += chunk.delta;
      }
      if (chunk.type === 'message-end') {
        content = chunk.content;
      }
    }

    return {
      type: 'summary',
      content: truncateSummary(content.trim() || 'No summary produced.'),
      sourceMessageIds: input.sourceMessageIds,
      metadata: { generatorId: this.id, model: this.options?.model },
    };
  }
}
