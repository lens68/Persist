import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createDatabase } from './db.js';
import { SqliteSessionStore } from './sqlite-session-store.js';
import { SqliteMemoryStore } from './sqlite-memory-store.js';

describe('SqliteMemoryStore', () => {
  let db: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    if (!db) return;
    const client = (db as unknown as { $client?: { close: () => void } }).$client;
    client?.close();
  });

  it('replaceActiveSummary supersedes previous in one transaction (IC-MEM-03)', async () => {
    const sessions = new SqliteSessionStore(db);
    const memory = new SqliteMemoryStore(db);
    const session = await sessions.createSession({ title: 't' });

    const first = await memory.replaceActiveSummary(session.id, {
      sessionId: session.id,
      type: 'summary',
      content: 'v1',
      sourceMessageIds: [],
    }, null);

    const second = await memory.replaceActiveSummary(
      session.id,
      {
        sessionId: session.id,
        type: 'summary',
        content: 'v2',
        sourceMessageIds: ['m1'],
      },
      first.id,
    );

    const all = await memory.listMemories(session.id);
    const old = all.find((m) => m.id === first.id)!;
    const active = await memory.getActiveSummary(session.id);

    expect(old.supersededBy).toBe(second.id);
    expect(active?.id).toBe(second.id);
    expect(all.filter((m) => !m.supersededBy)).toHaveLength(1);
  });
});
