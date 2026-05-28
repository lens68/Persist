import type { ExecutionPlan, PlanStepExecution, PlanStepExecutionStatus } from '@persist/shared';

/** Initial trace after plan persist (step 5): all steps pending or skipped for invalid. */
export function buildInitialExecutionTrace(
  plan: ExecutionPlan | null,
  status: 'valid' | 'invalid',
): PlanStepExecution[] {
  if (!plan || status === 'invalid') {
    return [];
  }
  return plan.steps.map((step) => ({
    stepId: step.id,
    status: 'pending' as PlanStepExecutionStatus,
  }));
}

export interface ApplyExecutionResultsInput {
  executedToolStepId?: string;
  truncatedToolStepIds?: string[];
  synthesisCompleted: boolean;
  synthesisFailed?: boolean;
}

/**
 * Patch execution trace after tool execution and synthesis (step 7/11).
 */
export function applyExecutionResults(
  plan: ExecutionPlan,
  trace: PlanStepExecution[],
  input: ApplyExecutionResultsInput,
): PlanStepExecution[] {
  const truncatedSet = new Set(input.truncatedToolStepIds ?? []);

  return plan.steps.map((step) => {
    const existing = trace.find((t) => t.stepId === step.id);
    const baseStatus = existing?.status ?? 'pending';

    if (step.type === 'tool') {
      // "completed" = runtime attempted this step; tool success/failure is on ToolExecutionSnapshot.
      if (input.executedToolStepId === step.id) {
        return { stepId: step.id, status: 'completed' as const };
      }
      if (truncatedSet.has(step.id)) {
        return { stepId: step.id, status: 'truncated' as const };
      }
      if (baseStatus === 'truncated' || baseStatus === 'completed') {
        return { stepId: step.id, status: baseStatus };
      }
      return { stepId: step.id, status: 'skipped' as const };
    }

    if (step.type === 'response') {
      if (input.synthesisCompleted) {
        return { stepId: step.id, status: 'completed' as const };
      }
      if (input.synthesisFailed) {
        return { stepId: step.id, status: 'skipped' as const };
      }
      return { stepId: step.id, status: baseStatus };
    }

    return { stepId: step.id, status: baseStatus };
  });
}

/** Tool steps after the first executed tool step are truncated (ADR-PLAN-03). */
export function listTruncatedToolStepsAfterFirst(
  plan: ExecutionPlan,
  firstToolStepId: string,
): string[] {
  let pastFirst = false;
  const ids: string[] = [];
  for (const step of plan.steps) {
    if (step.type !== 'tool') continue;
    if (step.id === firstToolStepId) {
      pastFirst = true;
      continue;
    }
    if (pastFirst) {
      ids.push(step.id);
    }
  }
  return ids;
}

/** Synthetic response-only plan for plan-invalid path. */
export function buildSyntheticResponseOnlyPlan(reason: string): ExecutionPlan {
  return {
    goal: reason,
    steps: [
      {
        id: 'step_response_fallback',
        type: 'response',
        description: 'Respond without tool execution after invalid plan',
      },
    ],
  };
}
