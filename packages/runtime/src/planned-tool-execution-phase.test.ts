import { describe, expect, it } from 'vitest';
import { executePlannedToolStep } from './planned-tool-execution-phase.js';
import type { ToolExecutionSnapshotStore, ToolExecutor } from '@persist/shared';

class InMemoryStore {
  messages: Array<Record<string, unknown>> = [];
  async appendMessage(_sessionId: string, input: Record<string, unknown>) {
    const msg = { id: input.id ?? crypto.randomUUID(), ...input };
    this.messages.push(msg);
    return msg;
  }
}

describe('executePlannedToolStep', () => {
  it('persists planId and planStepId on snapshot', async () => {
    const store = new InMemoryStore() as never;
    const planId = crypto.randomUUID();
    const snapshots: unknown[] = [];
    const toolExecutionSnapshotStore: ToolExecutionSnapshotStore = {
      async appendSnapshot(_sessionId, input) {
        snapshots.push(input);
        return { ...input, id: crypto.randomUUID() } as never;
      },
      async listSnapshots() {
        return [];
      },
    };
    const toolExecutor: ToolExecutor = {
      call: async () => ({ success: true, output: { ok: true } }),
    };

    const gen = executePlannedToolStep(
      { store, toolExecutor, toolExecutionSnapshotStore },
      {
        sessionId: crypto.randomUUID(),
        triggerMessageId: crypto.randomUUID(),
        planId,
        planStepId: 'step_tool_1',
        toolName: 'query_sales',
        input: { metric: 'revenue', period: 'last_month' },
      },
    );

    const chunks: { type: string }[] = [];
    let result = await gen.next();
    while (!result.done) {
      chunks.push(result.value);
      result = await gen.next();
    }

    expect(chunks.some((c) => c.type === 'tool-call-truncated')).toBe(false);
    expect(chunks.some((c) => c.type === 'tool-result')).toBe(true);
    expect(snapshots[0]).toMatchObject({ planId, planStepId: 'step_tool_1' });
  });
});
