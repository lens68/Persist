import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { SESSION_PREVIEW_TEXT_MAX_LENGTH } from '@persist/shared';
import { createDatabase } from './db.js';
import { SqliteSessionStore } from './sqlite-session-store.js';

describe('SqliteSessionStore.listSessionSummaries', () => {
  let db: ReturnType<typeof createDatabase>;
  let store: SqliteSessionStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    store = new SqliteSessionStore(db);
  });

  afterEach(() => {
    if (!db) return;
    const client = (db as unknown as { $client?: { close: () => void } }).$client;
    client?.close();
  });

  it('returns empty array for empty database', async () => {
    expect(await store.listSessionSummaries()).toEqual([]);
  });

  it('orders sessions by updatedAt DESC', async () => {
    const older = await store.createSession({});
    const newer = await store.createSession({});
    await store.appendMessage(older.id, { role: 'user', content: 'older' });
    await new Promise((r) => setTimeout(r, 5));
    await store.appendMessage(newer.id, { role: 'user', content: 'newer' });

    const list = await store.listSessionSummaries();
    expect(list.map((s) => s.id)).toEqual([newer.id, older.id]);
  });

  it('sets previewText from earliest user message truncated to CFG-HISTORY-02', async () => {
    const session = await store.createSession({});
    await store.appendMessage(session.id, { role: 'user', content: 'first message here' });
    await store.appendMessage(session.id, { role: 'user', content: 'second' });

    const [summary] = await store.listSessionSummaries();
    expect(summary?.previewText).toBe(
      'first message here'.slice(0, SESSION_PREVIEW_TEXT_MAX_LENGTH),
    );
  });

  it('excludes sessions without user messages (ADR-HISTORY-08)', async () => {
    const empty = await store.createSession({});
    const withUser = await store.createSession({});
    await store.appendMessage(withUser.id, { role: 'user', content: 'hi' });

    const list = await store.listSessionSummaries();
    expect(list.map((s) => s.id)).toEqual([withUser.id]);
    expect(list.find((s) => s.id === empty.id)).toBeUndefined();
  });

  it('counts all message roles including system and tool', async () => {
    const session = await store.createSession({});
    await store.appendMessage(session.id, { role: 'system', content: 'sys' });
    await store.appendMessage(session.id, { role: 'user', content: 'hi' });
    await store.appendMessage(session.id, { role: 'tool', content: 'tool out', toolName: 't' });
    await store.appendMessage(session.id, { role: 'assistant', content: 'reply' });

    const [summary] = await store.listSessionSummaries();
    expect(summary?.messageCount).toBe(4);
  });

  it('respects limit option', async () => {
    for (let i = 0; i < 3; i++) {
      const s = await store.createSession({});
      await store.appendMessage(s.id, { role: 'user', content: `msg ${i}` });
    }
    expect(await store.listSessionSummaries({ limit: 2 })).toHaveLength(2);
  });

  it('moves session to top after appendMessage updates updatedAt', async () => {
    const first = await store.createSession({});
    const second = await store.createSession({});
    await store.appendMessage(first.id, { role: 'user', content: 'a' });
    await store.appendMessage(second.id, { role: 'user', content: 'b' });
    await new Promise((r) => setTimeout(r, 5));
    await store.appendMessage(first.id, { role: 'user', content: 'c' });

    const list = await store.listSessionSummaries();
    expect(list[0]?.id).toBe(first.id);
  });
});
