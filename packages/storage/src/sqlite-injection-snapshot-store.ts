import { eq, asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  CreateMemoryInjectionSnapshotInput,
  InjectionSnapshotStore,
  MemoryInjectionSnapshot,
} from '@persist/shared';
import * as schema from './schema.js';

type Db = BetterSQLite3Database<typeof schema>;

export class SqliteInjectionSnapshotStore implements InjectionSnapshotStore {
  constructor(private readonly db: Db) {}

  async appendInjectionSnapshot(
    sessionId: string,
    input: CreateMemoryInjectionSnapshotInput,
  ): Promise<MemoryInjectionSnapshot> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db.insert(schema.injectionSnapshots).values({
      id,
      sessionId,
      triggerMessageId: input.triggerMessageId,
      strategy: input.strategy,
      injectedMemoryIds: input.injectedMemoryIds,
      resolvedMessages: input.resolvedMessages,
      createdAt: now,
    });

    return {
      id,
      sessionId,
      triggerMessageId: input.triggerMessageId,
      injectedMemoryIds: input.injectedMemoryIds,
      resolvedMessages: input.resolvedMessages,
      strategy: input.strategy,
      createdAt: now,
    };
  }

  async listInjectionSnapshots(sessionId: string): Promise<MemoryInjectionSnapshot[]> {
    const rows = await this.db
      .select()
      .from(schema.injectionSnapshots)
      .where(eq(schema.injectionSnapshots.sessionId, sessionId))
      .orderBy(asc(schema.injectionSnapshots.createdAt));

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      triggerMessageId: row.triggerMessageId,
      injectedMemoryIds: row.injectedMemoryIds,
      resolvedMessages: row.resolvedMessages,
      strategy: row.strategy,
      createdAt: row.createdAt,
    }));
  }
}
