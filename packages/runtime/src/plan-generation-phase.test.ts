import { describe, expect, it } from 'vitest';
import { runPlanGenerationPhase } from './plan-generation-phase.js';
import { createMockPlanGenerator, InMemoryPlanSnapshotStore } from './test-helpers.js';
import { selectFirstToolStep } from '@persist/plan';
import { QUERY_SALES_TOOL_DEFINITION } from '@persist/tool';

describe('runPlanGenerationPhase', () => {
  it('yields plan-generated for valid plan', async () => {
    const plan = {
      goal: 'g',
      steps: [
        {
          id: 't1',
          type: 'tool' as const,
          description: 'd',
          toolName: 'query_sales',
          input: { metric: 'revenue', period: 'last_month' },
        },
        { id: 'r1', type: 'response' as const, description: 'r' },
      ],
    };
    const store = new InMemoryPlanSnapshotStore();
    const gen = runPlanGenerationPhase(
      {
        planGenerator: createMockPlanGenerator(plan),
        planSnapshotStore: store,
        toolDefinitions: [QUERY_SALES_TOOL_DEFINITION],
      },
      {
        sessionId: crypto.randomUUID(),
        triggerMessageId: crypto.randomUUID(),
        resolvedMessages: [{ role: 'user', content: 'sales' }],
      },
    );
    const chunks: string[] = [];
    let result = await gen.next();
    while (!result.done) {
      chunks.push(result.value.type);
      result = await gen.next();
    }
    expect(chunks).toContain('plan-generated');
    expect(result.value.effectivePlan.steps).toHaveLength(2);
  });

  it('yields plan-invalid then synthetic plan-generated', async () => {
    const store = new InMemoryPlanSnapshotStore();
    const gen = runPlanGenerationPhase(
      {
        planGenerator: createMockPlanGenerator({
          goal: 'bad',
          steps: [
            {
              id: 't1',
              type: 'tool',
              description: 'd',
              toolName: 'nope',
              input: {},
            },
          ],
        }),
        planSnapshotStore: store,
        toolDefinitions: [QUERY_SALES_TOOL_DEFINITION],
      },
      {
        sessionId: crypto.randomUUID(),
        triggerMessageId: crypto.randomUUID(),
        resolvedMessages: [{ role: 'user', content: 'x' }],
      },
    );
    const types: string[] = [];
    let result = await gen.next();
    while (!result.done) {
      types.push(result.value.type);
      result = await gen.next();
    }
    expect(types).toContain('plan-invalid');
    expect(types).toContain('plan-generated');
    expect(selectFirstToolStep(result.value.effectivePlan)).toBeNull();
  });
});
