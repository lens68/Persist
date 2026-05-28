import { describe, expect, it } from 'vitest';
import type { ChatProvider, RuntimeChunk } from '@persist/shared';
import { LlmPlanGenerator } from './llm-plan-generator.js';

describe('LlmPlanGenerator', () => {
  it('parses JSON plan from provider text', async () => {
    const provider: ChatProvider = {
      id: 'mock',
      async *chat(): AsyncIterable<RuntimeChunk> {
        const messageId = crypto.randomUUID();
        yield {
          type: 'message-end',
          sessionId: crypto.randomUUID(),
          messageId,
          timestamp: new Date(),
          content: JSON.stringify({
            goal: 'g',
            steps: [{ id: 'r1', type: 'response', description: 'd' }],
          }),
        };
      },
    };
    const gen = new LlmPlanGenerator(provider);
    const plan = await gen.generatePlan({
      sessionId: crypto.randomUUID(),
      triggerMessageId: crypto.randomUUID(),
      resolvedMessages: [{ role: 'user', content: 'hi' }],
    });
    expect(plan.steps[0]?.type).toBe('response');
  });
});
