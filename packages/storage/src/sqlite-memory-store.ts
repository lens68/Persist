import { eq, asc, desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { CreateMemoryEntryInput, MemoryEntry, MemoryStore } from '@persist/shared';
import * as schema from './schema.js';

type Db = BetterSQLite3Database<typeof schema>;

export class SqliteMemoryStore implements MemoryStore {
  constructor(private readonly db: Db) {}

  async appendMemory(sessionId: string, input: CreateMemoryEntryInput): Promise<MemoryEntry> {
    if (input.type === 'summary') {
      throw new Error('Summary MemoryEntry must be persisted via replaceActiveSummary (IC-MEM-03)');
    }
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    await this.db.insert(schema.memoryEntries).values({
      id,
      sessionId,
      type: input.type,
      content: input.content,
      sourceMessageIds: input.sourceMessageIds ?? null,
      metadata: input.metadata ?? null,
      supersededBy: null,
      createdAt: now,
    });

    return this.mapEntry({
      id,
      sessionId,
      type: input.type,
      content: input.content,
      sourceMessageIds: input.sourceMessageIds ?? null,
      metadata: input.metadata ?? null,
      supersededBy: null,
      createdAt: now,
    });
  }

  async listMemories(sessionId: string): Promise<MemoryEntry[]> {
    const rows = await this.db
      .select()
      .from(schema.memoryEntries)
      .where(eq(schema.memoryEntries.sessionId, sessionId))
      .orderBy(asc(schema.memoryEntries.createdAt));
    return rows.map((r) => this.mapEntry(r));
  }

  async getActiveSummary(sessionId: string): Promise<MemoryEntry | null> {
    const rows = await this.db
      .select()
      .from(schema.memoryEntries)
      .where(eq(schema.memoryEntries.sessionId, sessionId))
      .orderBy(desc(schema.memoryEntries.createdAt));

    const active = rows.filter((r) => r.supersededBy == null && r.type === 'summary');
    if (active.length === 0) return null;
    return this.mapEntry(active[0]!);
  }

  async supersedeMemory(memoryId: string, supersededBy: string): Promise<MemoryEntry> {
    await this.db
      .update(schema.memoryEntries)
      .set({ supersededBy })
      .where(eq(schema.memoryEntries.id, memoryId));

    const rows = await this.db
      .select()
      .from(schema.memoryEntries)
      .where(eq(schema.memoryEntries.id, memoryId));
    return this.mapEntry(rows[0]!);
  }

  /**
   * IC-MEM-03 — atomic supersede + insert in one transaction.
   */
  async replaceActiveSummary(
    sessionId: string,
    input: CreateMemoryEntryInput,
    previousMemoryId: string | null,
  ): Promise<MemoryEntry> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    this.db.transaction((tx) => {
      if (previousMemoryId) {
        tx.update(schema.memoryEntries)
          .set({ supersededBy: id })
          .where(eq(schema.memoryEntries.id, previousMemoryId))
          .run();
      }

      tx.insert(schema.memoryEntries)
        .values({
          id,
          sessionId,
          type: input.type,
          content: input.content,
          sourceMessageIds: input.sourceMessageIds ?? null,
          metadata: input.metadata ?? null,
          supersededBy: null,
          createdAt: now,
        })
        .run();
    });

    return this.mapEntry({
      id,
      sessionId,
      type: input.type,
      content: input.content,
      sourceMessageIds: input.sourceMessageIds ?? null,
      metadata: input.metadata ?? null,
      supersededBy: null,
      createdAt: now,
    });
  }

  private mapEntry(row: typeof schema.memoryEntries.$inferSelect): MemoryEntry {
    return {
      id: row.id,
      sessionId: row.sessionId,
      type: row.type,
      content: row.content,
      sourceMessageIds: row.sourceMessageIds ?? undefined,
      metadata: row.metadata ?? undefined,
      supersededBy: row.supersededBy ?? undefined,
      createdAt: row.createdAt,
    };
  }
}
