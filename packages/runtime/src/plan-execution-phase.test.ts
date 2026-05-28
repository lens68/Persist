import { describe, expect, it } from 'vitest';
import { runPlanExecutionPhase } from './plan-execution-phase.js';
import {
  InMemoryPlanSnapshotStore,
  InMemorySessionStore,
  InMemoryToolSnapshotStore,
} from './test-helpers.js';

describe('runPlanExecutionPhase', () => {
  it('skips tool executor for response-only plan', async () => {
    const store = new InMemorySessionStore();
    const planStore = new InMemoryPlanSnapshotStore();
    const toolStore = new InMemoryToolSnapshotStore();
    const session = await store.createSession({});
    const snap = await planStore.appendSnapshot(session.id, {
      sessionId: session.id,
      triggerMessageId: crypto.randomUUID(),
      plan: {
        goal: 'g',
        steps: [{ id: 'r1', type: 'response', description: 'answer' }],
      },
      status: 'valid',
      executionTrace: [{ stepId: 'r1', status: 'pending' }],
    });

    const toolExecutor = { call: async () => ({ success: true, output: {} }) };
    const gen = runPlanExecutionPhase(
      { store, toolExecutor, toolExecutionSnapshotStore: toolStore, planSnapshotStore: planStore },
      {
        sessionId: session.id,
        triggerMessageId: snap.triggerMessageId,
        planSnapshot: snap,
        plan: snap.plan!,
      },
    );
    while (!(await gen.next()).done) {
      /* drain chunks */
    }
    expect(toolStore.snapshots).toHaveLength(0);
  });
});
