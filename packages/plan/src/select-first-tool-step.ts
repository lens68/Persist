import type { ExecutionPlan, PlanStep } from '@persist/shared';

/** Returns the first executable tool step in plan order (ADR-PLAN-03). */
export function selectFirstToolStep(plan: ExecutionPlan): PlanStep | null {
  return plan.steps.find((s) => s.type === 'tool') ?? null;
}
