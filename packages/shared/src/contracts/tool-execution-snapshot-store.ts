import type { CreateToolExecutionSnapshotInput, ToolExecutionSnapshot } from '../types/tool.js';

export interface ToolExecutionSnapshotStore {
  appendSnapshot(
    sessionId: string,
    input: CreateToolExecutionSnapshotInput,
  ): Promise<ToolExecutionSnapshot>;
  listSnapshots(sessionId: string): Promise<ToolExecutionSnapshot[]>;
}
