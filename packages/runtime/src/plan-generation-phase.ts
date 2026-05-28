import type {
  ExecutionPlan,
  PlanGenerator,
  PlanSnapshot,
  PlanSnapshotStore,
  RuntimeChunk,
  ToolDefinition,
} from '@persist/shared';
import {
  buildInitialExecutionTrace,
  buildSyntheticResponseOnlyPlan,
  validateExecutionPlan,
} from '@persist/plan';

export interface PlanGenerationPhaseResult {
  planSnapshot: PlanSnapshot;
  effectivePlan: ExecutionPlan;
  validationInvalid: boolean;
}

export async function* runPlanGenerationPhase(
  deps: {
    planGenerator: PlanGenerator;
    planSnapshotStore: PlanSnapshotStore;
    toolDefinitions: ToolDefinition[];
  },
  params: {
    sessionId: string;
    triggerMessageId: string;
    resolvedMessages: Parameters<PlanGenerator['generatePlan']>[0]['resolvedMessages'];
  },
): AsyncGenerator<RuntimeChunk, PlanGenerationPhaseResult> {
  const { sessionId, triggerMessageId, resolvedMessages } = params;
  const toolNames = deps.toolDefinitions.map((t) => t.name);

  let rawPlan: ExecutionPlan;
  try {
    rawPlan = await deps.planGenerator.generatePlan({
      sessionId,
      triggerMessageId,
      resolvedMessages,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const synthetic = buildSyntheticResponseOnlyPlan(reason);
    const snap = await deps.planSnapshotStore.appendSnapshot(sessionId, {
      sessionId,
      triggerMessageId,
      plan: null,
      status: 'invalid',
      executionTrace: [],
      invalidReason: reason,
    });
    yield {
      type: 'plan-invalid',
      sessionId,
      timestamp: new Date(),
      planSnapshotId: snap.id,
      reason,
    };
    const validSnap = await deps.planSnapshotStore.appendSnapshot(sessionId, {
      sessionId,
      triggerMessageId,
      plan: synthetic,
      status: 'valid',
      executionTrace: buildInitialExecutionTrace(synthetic, 'valid'),
    });
    yield {
      type: 'plan-generated',
      sessionId,
      timestamp: new Date(),
      planSnapshotId: validSnap.id,
      plan: synthetic,
    };
    return {
      planSnapshot: validSnap,
      effectivePlan: synthetic,
      validationInvalid: true,
    };
  }

  const validation = validateExecutionPlan(rawPlan, toolNames);
  if (!validation.valid) {
    const synthetic = buildSyntheticResponseOnlyPlan(validation.reason);
    const invalidSnap = await deps.planSnapshotStore.appendSnapshot(sessionId, {
      sessionId,
      triggerMessageId,
      plan: null,
      status: 'invalid',
      executionTrace: [],
      invalidReason: validation.reason,
    });
    yield {
      type: 'plan-invalid',
      sessionId,
      timestamp: new Date(),
      planSnapshotId: invalidSnap.id,
      reason: validation.reason,
    };
    const validSnap = await deps.planSnapshotStore.appendSnapshot(sessionId, {
      sessionId,
      triggerMessageId,
      plan: synthetic,
      status: 'valid',
      executionTrace: buildInitialExecutionTrace(synthetic, 'valid'),
    });
    yield {
      type: 'plan-generated',
      sessionId,
      timestamp: new Date(),
      planSnapshotId: validSnap.id,
      plan: synthetic,
    };
    return {
      planSnapshot: validSnap,
      effectivePlan: synthetic,
      validationInvalid: true,
    };
  }

  const plan = validation.plan;
  const snap = await deps.planSnapshotStore.appendSnapshot(sessionId, {
    sessionId,
    triggerMessageId,
    plan,
    status: 'valid',
    executionTrace: buildInitialExecutionTrace(plan, 'valid'),
  });

  yield {
    type: 'plan-generated',
    sessionId,
    timestamp: new Date(),
    planSnapshotId: snap.id,
    plan,
  };

  return {
    planSnapshot: snap,
    effectivePlan: plan,
    validationInvalid: false,
  };
}
