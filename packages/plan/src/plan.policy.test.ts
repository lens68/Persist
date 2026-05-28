import { describe, expect, it } from 'vitest';
import type { ExecutionPlan } from '@persist/shared';
import {
  applyExecutionResults,
  buildInitialExecutionTrace,
  buildSyntheticResponseOnlyPlan,
  listTruncatedToolStepsAfterFirst,
  selectFirstToolStep,
  validateExecutionPlan,
} from './index.js';

const salesPlan: ExecutionPlan = {
  goal: 'Top product',
  steps: [
    {
      id: 't1',
      type: 'tool',
      description: 'Query',
      toolName: 'query_sales',
      input: { metric: 'revenue', period: 'last_month' },
    },
    {
      id: 't2',
      type: 'tool',
      description: 'Compare',
      toolName: 'query_sales',
      input: { metric: 'revenue', period: 'last_quarter' },
    },
    { id: 'r1', type: 'response', description: 'Answer' },
  ],
};

describe('@persist/plan policy', () => {
  it('validateExecutionPlan accepts query_sales', () => {
    const r = validateExecutionPlan(salesPlan, ['query_sales']);
    expect(r.valid).toBe(true);
  });

  it('validateExecutionPlan rejects unknown tool', () => {
    const bad: ExecutionPlan = {
      goal: 'g',
      steps: [{ id: 't1', type: 'tool', description: 'x', toolName: 'unknown_tool', input: {} }],
    };
    const r = validateExecutionPlan(bad, ['query_sales']);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('unknown tool');
  });

  it('validateExecutionPlan rejects invalid query_sales input', () => {
    const bad: ExecutionPlan = {
      goal: 'g',
      steps: [
        {
          id: 't1',
          type: 'tool',
          description: 'x',
          toolName: 'query_sales',
          input: { metric: 'bad', period: 'last_month' },
        },
      ],
    };
    expect(validateExecutionPlan(bad, ['query_sales']).valid).toBe(false);
  });

  it('selectFirstToolStep returns first tool step', () => {
    expect(selectFirstToolStep(salesPlan)?.id).toBe('t1');
  });

  it('listTruncatedToolStepsAfterFirst marks second tool', () => {
    expect(listTruncatedToolStepsAfterFirst(salesPlan, 't1')).toEqual(['t2']);
  });

  it('buildInitialExecutionTrace pending for valid plan', () => {
    const trace = buildInitialExecutionTrace(salesPlan, 'valid');
    expect(trace).toHaveLength(3);
    expect(trace.every((t) => t.status === 'pending')).toBe(true);
  });

  it('applyExecutionResults marks executed and truncated', () => {
    const initial = buildInitialExecutionTrace(salesPlan, 'valid');
    const updated = applyExecutionResults(salesPlan, initial, {
      executedToolStepId: 't1',
      truncatedToolStepIds: ['t2'],
      synthesisCompleted: true,
    });
    expect(updated.find((t) => t.stepId === 't1')?.status).toBe('completed');
    expect(updated.find((t) => t.stepId === 't2')?.status).toBe('truncated');
    expect(updated.find((t) => t.stepId === 'r1')?.status).toBe('completed');
  });

  it('buildSyntheticResponseOnlyPlan is response-only', () => {
    const plan = buildSyntheticResponseOnlyPlan('invalid');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.type).toBe('response');
    expect(selectFirstToolStep(plan)).toBeNull();
  });
});
