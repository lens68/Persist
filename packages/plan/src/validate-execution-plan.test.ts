import { describe, expect, it } from 'vitest';
import { validateExecutionPlan } from './validate-execution-plan.js';

describe('validateExecutionPlan', () => {
  it('accepts non-query_sales tool with membership check only', () => {
    const r = validateExecutionPlan(
      {
        goal: 'g',
        steps: [
          {
            id: 't1',
            type: 'tool',
            description: 'd',
            toolName: 'other_tool',
            input: { any: 'shape' },
          },
        ],
      },
      ['other_tool'],
    );
    expect(r.valid).toBe(true);
  });

  it('rejects response step with toolName', () => {
    const r = validateExecutionPlan(
      {
        goal: 'g',
        steps: [
          {
            id: 'r1',
            type: 'response',
            description: 'd',
            toolName: 'query_sales',
          },
        ],
      },
      ['query_sales'],
    );
    expect(r.valid).toBe(false);
  });
});
