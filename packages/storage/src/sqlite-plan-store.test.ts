import { describe, expect, it } from 'vitest';
import { createDatabase } from './db.js';
import { SqlitePlanSnapshotStore } from './sqlite-plan-snapshot-store.js';
import { SqliteSessionStore } from './sqlite-session-store.js';
import { SqliteToolExecutionSnapshotStore } from './sqlite-tool-execution-snapshot-store.js';

describe('plan storage (v0.4)', () => {
  it('persists plan snapshot and updates executionTrace', async () => {
    const db = createDatabase(':memory:');
    const sessionStore = new SqliteSessionStore(db);
    const planStore = new SqlitePlanSnapshotStore(db);
    const session = await sessionStore.createSession({});

    const plan = {
      goal: 'Top sales',
      steps: [
        {
          id: 't1',
          type: 'tool' as const,
          description: 'Query',
          toolName: 'query_sales',
          input: { metric: 'revenue', period: 'last_month' },
        },
        { id: 'r1', type: 'response' as const, description: 'Answer' },
      ],
    };

    const snap = await planStore.appendSnapshot(session.id, {
      sessionId: session.id,
      triggerMessageId: crypto.randomUUID(),
      plan,
      status: 'valid',
      executionTrace: [
        { stepId: 't1', status: 'pending' },
        { stepId: 'r1', status: 'pending' },
      ],
    });

    const updated = await planStore.updateExecutionTrace(session.id, snap.id, [
      { stepId: 't1', status: 'completed' },
      { stepId: 'r1', status: 'completed' },
    ]);
    expect(updated.executionTrace[0]?.status).toBe('completed');

    const replay = await sessionStore.getReplay(session.id);
    expect(replay?.planSnapshots).toHaveLength(1);
    expect(replay?.planSnapshots[0]?.executionTrace[1]?.status).toBe('completed');
  });

  it('tool snapshot stores planId and planStepId', async () => {
    const db = createDatabase(':memory:');
    const sessionStore = new SqliteSessionStore(db);
    const toolStore = new SqliteToolExecutionSnapshotStore(db);
    const session = await sessionStore.createSession({});
    const planId = crypto.randomUUID();

    await toolStore.appendSnapshot(session.id, {
      sessionId: session.id,
      triggerMessageId: crypto.randomUUID(),
      planId,
      planStepId: 't1',
      toolName: 'query_sales',
      toolInput: { metric: 'revenue', period: 'last_month' },
      toolOutput: { product: 'Widget A' },
      startedAt: new Date(),
      completedAt: new Date(),
      status: 'completed',
    });

    const replay = await sessionStore.getReplay(session.id);
    expect(replay?.toolExecutionSnapshots[0]?.planId).toBe(planId);
    expect(replay?.toolExecutionSnapshots[0]?.planStepId).toBe('t1');
  });

  it('getReplay does not invoke PlanGenerator (NFR)', async () => {
    const db = createDatabase(':memory:');
    const sessionStore = new SqliteSessionStore(db);
    const planStore = new SqlitePlanSnapshotStore(db);
    const session = await sessionStore.createSession({});

    await planStore.appendSnapshot(session.id, {
      sessionId: session.id,
      triggerMessageId: crypto.randomUUID(),
      plan: null,
      status: 'invalid',
      executionTrace: [],
      invalidReason: 'test',
    });

    const replay = await sessionStore.getReplay(session.id);
    expect(replay?.planSnapshots).toHaveLength(1);
  });
});
