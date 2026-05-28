import { asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  CreatePlanSnapshotInput,
  PlanSnapshot,
  PlanSnapshotStore,
  PlanStepExecution,
} from '@persist/shared';
import * as schema from './schema.js';

type Db = BetterSQLite3Database<typeof schema>;

export class SqlitePlanSnapshotStore implements PlanSnapshotStore {
  constructor(private readonly db: Db) {}

  async appendSnapshot(sessionId: string, input: CreatePlanSnapshotInput): Promise<PlanSnapshot> {
    const id = input.id ?? crypto.randomUUID();
    const createdAt = new Date();

    await this.db.insert(schema.planSnapshots).values({
      id,
      sessionId,
      triggerMessageId: input.triggerMessageId,
      planJson: input.plan,
      status: input.status,
      executionTraceJson: input.executionTrace,
      invalidReason: input.invalidReason ?? null,
      createdAt,
    });

    return this.mapRow({
      id,
      sessionId,
      triggerMessageId: input.triggerMessageId,
      planJson: input.plan,
      status: input.status,
      executionTraceJson: input.executionTrace,
      invalidReason: input.invalidReason ?? null,
      createdAt,
    });
  }

  async updateExecutionTrace(
    sessionId: string,
    snapshotId: string,
    executionTrace: PlanStepExecution[],
  ): Promise<PlanSnapshot> {
    await this.db
      .update(schema.planSnapshots)
      .set({ executionTraceJson: executionTrace })
      .where(eq(schema.planSnapshots.id, snapshotId));

    const rows = await this.db
      .select()
      .from(schema.planSnapshots)
      .where(eq(schema.planSnapshots.id, snapshotId));

    const row = rows[0];
    if (!row || row.sessionId !== sessionId) {
      throw new Error(`Plan snapshot ${snapshotId} not found for session ${sessionId}`);
    }
    return this.mapRow(row);
  }

  async listSnapshots(sessionId: string): Promise<PlanSnapshot[]> {
    const rows = await this.db
      .select()
      .from(schema.planSnapshots)
      .where(eq(schema.planSnapshots.sessionId, sessionId))
      .orderBy(asc(schema.planSnapshots.createdAt));

    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: typeof schema.planSnapshots.$inferSelect): PlanSnapshot {
    return {
      id: row.id,
      sessionId: row.sessionId,
      triggerMessageId: row.triggerMessageId,
      plan: row.planJson,
      status: row.status,
      executionTrace: row.executionTraceJson,
      invalidReason: row.invalidReason ?? undefined,
      createdAt: row.createdAt,
    };
  }
}
