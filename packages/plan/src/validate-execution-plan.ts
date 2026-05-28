import type { ExecutionPlan, PlanStep } from '@persist/shared';
import { validateQuerySalesInput } from '@persist/tool';

export type ValidateExecutionPlanResult =
  | { valid: true; plan: ExecutionPlan }
  | { valid: false; reason: string };

export function validateExecutionPlan(
  plan: ExecutionPlan,
  availableToolNames: readonly string[],
): ValidateExecutionPlanResult {
  if (!plan.goal?.trim()) {
    return { valid: false, reason: 'plan goal is required' };
  }
  if (!plan.steps.length) {
    return { valid: false, reason: 'plan must have at least one step' };
  }

  const seenIds = new Set<string>();
  for (const step of plan.steps) {
    const stepError = validatePlanStep(step, availableToolNames);
    if (stepError) {
      return { valid: false, reason: stepError };
    }
    if (seenIds.has(step.id)) {
      return { valid: false, reason: `duplicate step id: ${step.id}` };
    }
    seenIds.add(step.id);
  }

  return { valid: true, plan };
}

function validatePlanStep(step: PlanStep, availableToolNames: readonly string[]): string | null {
  if (!step.id?.trim()) return 'step id is required';
  if (!step.description?.trim()) return `step ${step.id}: description is required`;

  if (step.type === 'response') {
    if (step.toolName !== undefined || step.input !== undefined) {
      return `step ${step.id}: response step must not have toolName or input`;
    }
    return null;
  }

  if (step.type === 'tool') {
    if (!step.toolName?.trim()) {
      return `step ${step.id}: tool step requires toolName`;
    }
    if (!availableToolNames.includes(step.toolName)) {
      return `step ${step.id}: unknown tool "${step.toolName}"`;
    }
    if (step.toolName === 'query_sales') {
      try {
        validateQuerySalesInput(step.input ?? {});
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return `step ${step.id}: ${msg}`;
      }
    }
    return null;
  }

  return `step ${step.id}: unknown step type`;
}
