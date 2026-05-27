import { describe, expect, it } from 'vitest';
import type { ChatRequest, MemoryGenerationInput, RuntimeChunk } from '@persist/shared';
import type { ChatProvider } from '@persist/shared';
import { LlmSummaryMemoryGenerator } from './llm-summary-memory-generator.js';

class SummaryMockProvider implements ChatProvider {
  readonly id = 'summary-mock';
  lastRequest: ChatRequest | null = null;

  async *chat(request: ChatRequest): AsyncIterable<RuntimeChunk> {
    this.lastRequest = request;
    const messageId = crypto.randomUUID();
    yield {
      type: 'message-start',
      sessionId: request.sessionId,
      messageId,
      role: 'assistant',
      timestamp: new Date(),
    };
    yield {
      type: 'message-end',
      sessionId: request.sessionId,
      messageId,
      timestamp: new Date(),
      content: 'Condensed runtime continuity.',
    };
    yield {
      type: 'done',
      sessionId: request.sessionId,
      messageId,
      completionState: 'completed',
      timestamp: new Date(),
    };
  }
}

describe('LlmSummaryMemoryGenerator', () => {
  it('calls provider.chat directly, not executeChat', async () => {
    const provider = new SummaryMockProvider();
    const generator = new LlmSummaryMemoryGenerator(provider);
    const input: MemoryGenerationInput = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      activeSummary: null,
      unsummarizedMessages: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          role: 'user',
          content: 'hello',
          completionState: 'completed',
          createdAt: new Date(),
        },
      ],
      sourceMessageIds: ['550e8400-e29b-41d4-a716-446655440001'],
    };

    const summary = await generator.generateSummary(input);
    expect(summary.content).toContain('Condensed');
    expect(provider.lastRequest?.messages[0]?.role).toBe('system');
  });
});
