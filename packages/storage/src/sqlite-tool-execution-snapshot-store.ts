import { eq, asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  CreateToolExecutionSnapshotInput,
  ToolExecutionSnapshot,
  ToolExecutionSnapshotStore,
  ToolExecutionStatus,
} from '@persist/shared';
import * as schema from './schema.js';

type Db = BetterSQLite3Database<typeof schema>;

export class SqliteToolExecutionSnapshotStore implements ToolExecutionSnapshotStore {
  constructor(private readonly db: Db) {}

  async appendSnapshot(
    sessionId: string,
    input: CreateToolExecutionSnapshotInput,
  ): Promise<ToolExecutionSnapshot> {
    const id = input.id ?? crypto.randomUUID();

    await this.db.insert(schema.toolExecutionSnapshots).values({
      id,
      sessionId,
      triggerMessageId: input.triggerMessageId,
      toolName: input.toolName,
      toolInputJson: input.toolInput,
      toolOutputJson: input.toolOutput,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      status: input.status,
      payloadTruncated: input.payloadTruncated ?? null,
    });

    return {
      id,
      sessionId,
      triggerMessageId: input.triggerMessageId,
      toolName: input.toolName,
      toolInput: input.toolInput,
      toolOutput: input.toolOutput,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      status: input.status,
      payloadTruncated: input.payloadTruncated,
    };
  }

  async listSnapshots(sessionId: string): Promise<ToolExecutionSnapshot[]> {
    const rows = await this.db
      .select()
      .from(schema.toolExecutionSnapshots)
      .where(eq(schema.toolExecutionSnapshots.sessionId, sessionId))
      .orderBy(asc(schema.toolExecutionSnapshots.startedAt));

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      triggerMessageId: row.triggerMessageId,
      toolName: row.toolName,
      toolInput: row.toolInputJson,
      toolOutput: row.toolOutputJson,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      status: row.status as ToolExecutionStatus,
      payloadTruncated: row.payloadTruncated ?? undefined,
    }));
  }
}
