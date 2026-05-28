import { describe, expect, it } from 'vitest';
import { executeToolCallPhase } from './tool-execution-phase.js';
import type { ToolExecutionSnapshotStore, ToolExecutor } from '@persist/shared';

class InMemoryStore {
  messages: Array<Record<string, unknown>> = [];
  async appendMessage(_sessionId: string, input: Record<string, unknown>) {
    const msg = { id: input.id ?? crypto.randomUUID(), ...input };
    this.messages.push(msg);
    return msg;
  }
}

describe('executeToolCallPhase', () => {
  it('emits tool-call-truncated for multiple tool calls (IC-TOOL-06)', async () => {
    const store = new InMemoryStore() as unknown as Parameters<
      typeof executeToolCallPhase
    >[0]['store'];
    const toolExecutor: ToolExecutor = {
      call: async () => ({ success: true, output: { ok: true } }),
    };
    const snapshots: unknown[] = [];
    const toolExecutionSnapshotStore: ToolExecutionSnapshotStore = {
      async appendSnapshot(_sessionId, input) {
        const snap = { ...input, id: crypto.randomUUID() };
        snapshots.push(snap);
        return snap as never;
      },
      async listSnapshots() {
        return [];
      },
    };

    const gen = executeToolCallPhase(
      { store, toolExecutor, toolExecutionSnapshotStore },
      {
        sessionId: crypto.randomUUID(),
        triggerMessageId: crypto.randomUUID(),
        toolCalls: [
          { id: 'a', name: 'query_sales', arguments: '{"metric":"revenue","period":"last_month"}' },
          { id: 'b', name: 'other', arguments: '{}' },
        ],
      },
    );

    const chunks: { type: string }[] = [];
    let result = await gen.next();
    while (!result.done) {
      chunks.push(result.value);
      result = await gen.next();
    }

    expect(chunks.some((c) => c.type === 'tool-call-truncated')).toBe(true);
    expect(chunks.some((c) => c.type === 'tool-result')).toBe(true);
    expect(snapshots).toHaveLength(1);
    expect(toolExecutor).toBeDefined();
  });

  it('failed tool still persists snapshot with failed status', async () => {
    const store = new InMemoryStore() as unknown as Parameters<
      typeof executeToolCallPhase
    >[0]['store'];
    const toolExecutor: ToolExecutor = {
      call: async () => ({
        success: false,
        output: null,
        error: { code: 'err', message: 'fail' },
      }),
    };
    let status = '';
    const toolExecutionSnapshotStore: ToolExecutionSnapshotStore = {
      async appendSnapshot(_sessionId, input) {
        status = input.status;
        return { ...input, id: crypto.randomUUID() } as never;
      },
      async listSnapshots() {
        return [];
      },
    };

    const gen = executeToolCallPhase(
      { store, toolExecutor, toolExecutionSnapshotStore },
      {
        sessionId: crypto.randomUUID(),
        triggerMessageId: crypto.randomUUID(),
        toolCalls: [{ id: 'a', name: 'query_sales', arguments: '{}' }],
      },
    );
    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }
    expect(status).toBe('failed');
  });
});
