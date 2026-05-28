import { describe, expect, it } from 'vitest';
import { createDatabase } from './db.js';
import { SqliteToolExecutionSnapshotStore } from './sqlite-tool-execution-snapshot-store.js';
import { SqliteSessionStore } from './sqlite-session-store.js';
import { SqliteInProcessToolExecutor } from './sqlite-in-process-tool-executor.js';

describe('tool storage (v0.3)', () => {
  it('persists and replays tool execution snapshots (FR-TOOL-11)', async () => {
    const db = createDatabase(':memory:');
    const sessionStore = new SqliteSessionStore(db);
    const toolStore = new SqliteToolExecutionSnapshotStore(db);
    const session = await sessionStore.createSession({});

    await toolStore.appendSnapshot(session.id, {
      sessionId: session.id,
      triggerMessageId: crypto.randomUUID(),
      toolName: 'query_sales',
      toolInput: { metric: 'revenue', period: 'last_month' },
      toolOutput: { product: 'Widget A' },
      startedAt: new Date(),
      completedAt: new Date(),
      status: 'completed',
    });

    const replay = await sessionStore.getReplay(session.id);
    expect(replay?.toolExecutionSnapshots).toHaveLength(1);
    expect(replay?.toolExecutionSnapshots[0]?.toolName).toBe('query_sales');
  });

  it('getReplay is DB reconstruction only — no ToolExecutor (NFR-TOOL-04)', async () => {
    const db = createDatabase(':memory:');
    const sessionStore = new SqliteSessionStore(db);
    const toolStore = new SqliteToolExecutionSnapshotStore(db);
    const session = await sessionStore.createSession({});

    await toolStore.appendSnapshot(session.id, {
      sessionId: session.id,
      triggerMessageId: crypto.randomUUID(),
      toolName: 'query_sales',
      toolInput: {},
      toolOutput: {},
      startedAt: new Date(),
      completedAt: new Date(),
      status: 'completed',
    });

    const replay = await sessionStore.getReplay(session.id);
    expect(replay?.toolExecutionSnapshots).toHaveLength(1);
    expect(replay?.toolExecutionSnapshots[0]?.toolName).toBe('query_sales');
  });

  it('query_sales executor reads fixture (FR-TOOL-16)', async () => {
    const executor = new SqliteInProcessToolExecutor({
      fixtureDatabaseUrl: ':memory:',
    });
    const result = await executor.call(
      'query_sales',
      { metric: 'revenue', period: 'last_month' },
      { sessionId: crypto.randomUUID(), triggerMessageId: crypto.randomUUID() },
    );
    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({ product: expect.any(String) });
  });
});
