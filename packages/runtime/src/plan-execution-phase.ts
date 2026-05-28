import type {
  ExecutionPlan,
  PlanSnapshot,
  PlanSnapshotStore,
  RuntimeChunk,
  SessionStore,
  ToolExecutionSnapshotStore,
  ToolExecutor,
} from '@persist/shared';
import {
  applyExecutionResults,
  listTruncatedToolStepsAfterFirst,
  selectFirstToolStep,
} from '@persist/plan';
import { executePlannedToolStep } from './planned-tool-execution-phase.js';

export interface PlanExecutionPhaseResult {
  executedToolStepId?: string;
  truncatedToolStepIds: string[];
}

export async function* runPlanExecutionPhase(
  deps: {
    store: SessionStore;
    toolExecutor: ToolExecutor;
    toolExecutionSnapshotStore: ToolExecutionSnapshotStore;
    planSnapshotStore: PlanSnapshotStore;
  },
  params: {
    sessionId: string;
    triggerMessageId: string;
    planSnapshot: PlanSnapshot;
    plan: ExecutionPlan;
    signal?: AbortSignal;
  },
): AsyncGenerator<RuntimeChunk, PlanExecutionPhaseResult> {
  const { sessionId, triggerMessageId, planSnapshot, plan, signal } = params;
  const planSnapshotId = planSnapshot.id;

  const firstTool = selectFirstToolStep(plan);
  let executedToolStepId: string | undefined;
  const truncatedToolStepIds: string[] = firstTool
    ? listTruncatedToolStepsAfterFirst(plan, firstTool.id)
    : [];

  for (const step of plan.steps) {
    if (step.type === 'tool') {
      const isFirst = firstTool?.id === step.id;
      const isTruncated = truncatedToolStepIds.includes(step.id);

      yield {
        type: 'plan-step-start',
        sessionId,
        timestamp: new Date(),
        planSnapshotId,
        stepId: step.id,
        stepType: 'tool',
      };

      if (isTruncated) {
        yield {
          type: 'plan-step-truncated',
          sessionId,
          timestamp: new Date(),
          planSnapshotId,
          stepId: step.id,
          reason: 'maxExecutableToolSteps',
        };
        yield {
          type: 'plan-step-end',
          sessionId,
          timestamp: new Date(),
          planSnapshotId,
          stepId: step.id,
          stepType: 'tool',
          status: 'truncated',
        };
        continue;
      }

      if (isFirst && firstTool) {
        const toolGen = executePlannedToolStep(
          {
            store: deps.store,
            toolExecutor: deps.toolExecutor,
            toolExecutionSnapshotStore: deps.toolExecutionSnapshotStore,
          },
          {
            sessionId,
            triggerMessageId,
            planId: planSnapshotId,
            planStepId: step.id,
            toolName: step.toolName!,
            input: step.input,
            signal,
          },
        );
        let toolResult = await toolGen.next();
        while (!toolResult.done) {
          yield toolResult.value;
          toolResult = await toolGen.next();
        }
        executedToolStepId = step.id;
        yield {
          type: 'plan-step-end',
          sessionId,
          timestamp: new Date(),
          planSnapshotId,
          stepId: step.id,
          stepType: 'tool',
          status: 'completed',
        };
      }
      continue;
    }

    if (step.type === 'response') {
      yield {
        type: 'plan-step-start',
        sessionId,
        timestamp: new Date(),
        planSnapshotId,
        stepId: step.id,
        stepType: 'response',
      };
    }
  }

  const trace = applyExecutionResults(plan, planSnapshot.executionTrace, {
    executedToolStepId,
    truncatedToolStepIds,
    synthesisCompleted: false,
  });
  await deps.planSnapshotStore.updateExecutionTrace(sessionId, planSnapshotId, trace);

  return { executedToolStepId, truncatedToolStepIds };
}

/** Mark response steps completed/skipped after synthesis (IC-PLAN trace). */
export async function finalizePlanTraceAfterSynthesis(
  planSnapshotStore: PlanSnapshotStore,
  params: {
    sessionId: string;
    planSnapshot: PlanSnapshot;
    plan: ExecutionPlan;
    executedToolStepId?: string;
    truncatedToolStepIds: string[];
    synthesisCompleted: boolean;
    synthesisFailed?: boolean;
  },
): Promise<void> {
  const trace = applyExecutionResults(params.plan, params.planSnapshot.executionTrace, {
    executedToolStepId: params.executedToolStepId,
    truncatedToolStepIds: params.truncatedToolStepIds,
    synthesisCompleted: params.synthesisCompleted,
    synthesisFailed: params.synthesisFailed,
  });
  await planSnapshotStore.updateExecutionTrace(params.sessionId, params.planSnapshot.id, trace);
}
