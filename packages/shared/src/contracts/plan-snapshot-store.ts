import type { CreatePlanSnapshotInput, PlanSnapshot, PlanStepExecution } from '../types/plan.js';

export interface PlanSnapshotStore {
  appendSnapshot(sessionId: string, input: CreatePlanSnapshotInput): Promise<PlanSnapshot>;
  updateExecutionTrace(
    sessionId: string,
    snapshotId: string,
    executionTrace: PlanStepExecution[],
  ): Promise<PlanSnapshot>;
  listSnapshots(sessionId: string): Promise<PlanSnapshot[]>;
}
