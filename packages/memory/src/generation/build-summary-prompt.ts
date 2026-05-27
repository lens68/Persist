import type { ChatMessage } from '@persist/shared';
import type { MemoryGenerationInput } from '@persist/shared';

/** Prompt assembly for LLM summary generation (IC-MEM-02 incremental window). */
export function buildSummaryPromptMessages(input: MemoryGenerationInput): ChatMessage[] {
  const sections: string[] = [];

  if (input.activeSummary) {
    sections.push(`Previous runtime continuity summary:\n${input.activeSummary.content}`);
  }

  if (input.unsummarizedMessages.length > 0) {
    sections.push(
      'Messages to incorporate into the updated summary:',
      ...input.unsummarizedMessages.map((m) => `${m.role}: ${m.content}`),
    );
  }

  return [
    {
      role: 'system',
      content:
        'You produce concise runtime continuity summaries for an execution runtime. ' +
        'Output only the updated summary text without preamble or markdown.',
    },
    {
      role: 'user',
      content: sections.join('\n\n') || 'No new messages.',
    },
  ];
}
