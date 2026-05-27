import { eq, asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  CreateMessageInput,
  CreateSessionInput,
  Message,
  Session,
  SessionReplay,
  SessionStore,
  SessionWithMessages,
} from '@persist/shared';
import type { ProviderMetadata } from '@persist/shared';
import type { StreamCompletionState } from '@persist/shared';
import * as schema from './schema.js';

type Db = BetterSQLite3Database<typeof schema>;

export class SqliteSessionStore implements SessionStore {
  constructor(private readonly db: Db) {}

  async createSession(input: CreateSessionInput): Promise<Session> {
    const id = crypto.randomUUID();
    const now = new Date();
    await this.db.insert(schema.sessions).values({
      id,
      userId: input.userId ?? null,
      title: input.title ?? null,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return {
      id,
      userId: input.userId ?? null,
      title: input.title,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getSession(id: string): Promise<Session | null> {
    const rows = await this.db.select().from(schema.sessions).where(eq(schema.sessions.id, id));
    const row = rows[0];
    if (!row) return null;
    return this.mapSession(row);
  }

  async getSessionWithMessages(id: string): Promise<SessionWithMessages | null> {
    const session = await this.getSession(id);
    if (!session) return null;
    const msgRows = await this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.sessionId, id))
      .orderBy(asc(schema.messages.createdAt));
    return {
      ...session,
      messages: msgRows.map((r) => this.mapMessage(r)),
    };
  }

  async appendMessage(sessionId: string, input: CreateMessageInput): Promise<Message> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();
    const completionState = (input.completionState ?? 'completed') as StreamCompletionState;

    await this.db.insert(schema.messages).values({
      id,
      sessionId,
      role: input.role,
      content: input.content,
      completionState,
      providerMetadata: input.providerMetadata ?? null,
      createdAt: now,
      completedAt: completionState === 'completed' ? now : null,
    });

    await this.db
      .update(schema.sessions)
      .set({ updatedAt: now })
      .where(eq(schema.sessions.id, sessionId));

    return {
      id,
      sessionId,
      role: input.role,
      content: input.content,
      completionState,
      providerMetadata: input.providerMetadata,
      createdAt: now,
      completedAt: completionState === 'completed' ? now : undefined,
    };
  }

  async updateMessage(
    sessionId: string,
    messageId: string,
    patch: Partial<
      Pick<Message, 'content' | 'providerMetadata' | 'completionState' | 'completedAt'>
    >,
  ): Promise<Message> {
    const now = new Date();
    const updates: Partial<typeof schema.messages.$inferInsert> = {};
    if (patch.content !== undefined) updates.content = patch.content;
    if (patch.completionState !== undefined) updates.completionState = patch.completionState;
    if (patch.providerMetadata !== undefined) updates.providerMetadata = patch.providerMetadata;
    if (patch.completedAt !== undefined) updates.completedAt = patch.completedAt;

    await this.db.update(schema.messages).set(updates).where(eq(schema.messages.id, messageId));

    await this.db
      .update(schema.sessions)
      .set({ updatedAt: now })
      .where(eq(schema.sessions.id, sessionId));

    const rows = await this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, messageId));
    return this.mapMessage(rows[0]!);
  }

  async getReplay(sessionId: string): Promise<SessionReplay | null> {
    const swm = await this.getSessionWithMessages(sessionId);
    if (!swm) return null;

    const memoryRows = await this.db
      .select()
      .from(schema.memoryEntries)
      .where(eq(schema.memoryEntries.sessionId, sessionId))
      .orderBy(asc(schema.memoryEntries.createdAt));

    const snapshotRows = await this.db
      .select()
      .from(schema.injectionSnapshots)
      .where(eq(schema.injectionSnapshots.sessionId, sessionId))
      .orderBy(asc(schema.injectionSnapshots.createdAt));

    const { messages, ...sessionOnly } = swm;
    return {
      session: sessionOnly,
      messages,
      memories: memoryRows.map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        type: row.type,
        content: row.content,
        sourceMessageIds: row.sourceMessageIds ?? undefined,
        metadata: row.metadata ?? undefined,
        supersededBy: row.supersededBy ?? undefined,
        createdAt: row.createdAt,
      })),
      injectionSnapshots: snapshotRows.map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        triggerMessageId: row.triggerMessageId,
        injectedMemoryIds: row.injectedMemoryIds,
        resolvedMessages: row.resolvedMessages,
        strategy: row.strategy,
        createdAt: row.createdAt,
      })),
      reconstructedAt: new Date(),
    };
  }

  private mapSession(row: typeof schema.sessions.$inferSelect): Session {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title ?? undefined,
      metadata: row.metadata ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapMessage(row: typeof schema.messages.$inferSelect): Message {
    return {
      id: row.id,
      sessionId: row.sessionId,
      role: row.role,
      content: row.content,
      completionState: row.completionState as StreamCompletionState,
      providerMetadata: row.providerMetadata as ProviderMetadata | undefined,
      createdAt: row.createdAt,
      completedAt: row.completedAt ?? undefined,
    };
  }
}
