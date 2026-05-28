import { describe, expect, it } from 'vitest';
import { executeChat } from './chat-execution.js';
import type { ChatProvider, ChatRequest, RuntimeChunk } from '@persist/shared';
import { QUERY_SALES_TOOL_DEFINITION } from '@persist/tool';
import { RuleBasedMemoryGenerator } from '@persist/memory';
import { RuleBasedPlanGenerator } from '@persist/planning';
import {
  InMemoryInjectionSnapshotStore,
  InMemoryMemoryStore,
  InMemoryPlanSnapshotStore,
  InMemorySessionStore,
  InMemoryToolSnapshotStore,
} from './test-helpers.js';

class SalesToolExecutor {
  callCount = 0;
  async call(toolName: string, input: unknown) {
    this.callCount++;
    if (toolName !== 'query_sales') {
      return { success: false, output: null, error: { code: 'unknown', message: 'unknown' } };
    }
    return {
      success: true,
      output: { product: 'Widget A', value: 12000, metric: (input as { metric: string }).metric },
    };
  }
}

describe('sales e2e planning chain (v0.4)', () => {
  it('plan → query_sales → synthesis with tool in context', async () => {
    const providerCalls: ChatRequest[] = [];
    const provider: ChatProvider = {
      id: 'mock',
      async *chat(request: ChatRequest): AsyncIterable<RuntimeChunk> {
        providerCalls.push(request);
        const messageId = crypto.randomUUID();
        yield {
          type: 'message-start',
          sessionId: request.sessionId,
          messageId,
          role: 'assistant',
          timestamp: new Date(),
        };
        yield {
          type: 'text-delta',
          sessionId: request.sessionId,
          messageId,
          timestamp: new Date(),
          delta: 'Widget A leads with 12000 revenue.',
        };
        yield {
          type: 'message-end',
          sessionId: request.sessionId,
          messageId,
          timestamp: new Date(),
          content: 'Widget A leads with 12000 revenue.',
        };
        yield {
          type: 'done',
          sessionId: request.sessionId,
          messageId,
          completionState: 'completed',
          timestamp: new Date(),
        };
      },
    };

    const toolExecutor = new SalesToolExecutor();
    const deps = {
      provider,
      planGenerator: new RuleBasedPlanGenerator(),
      planSnapshotStore: new InMemoryPlanSnapshotStore(),
      store: new InMemorySessionStore(),
      memoryStore: new InMemoryMemoryStore(),
      injectionSnapshotStore: new InMemoryInjectionSnapshotStore(),
      memoryGenerator: new RuleBasedMemoryGenerator(),
      toolExecutor,
      toolDefinitions: [QUERY_SALES_TOOL_DEFINITION],
      toolExecutionSnapshotStore: new InMemoryToolSnapshotStore(),
    };

    const session = await deps.store.createSession({});
    for await (const _c of executeChat(deps, {
      sessionId: session.id,
      userContent: '请查询上个月 revenue 销量第一的产品',
    })) {
      /* drain */
    }

    expect(toolExecutor.callCount).toBe(1);
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]?.tools).toBeUndefined();
    expect(providerCalls[0]?.messages.some((m) => m.role === 'tool')).toBe(true);

    const swm = await deps.store.getSessionWithMessages(session.id);
    expect(swm?.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(swm?.messages.some((m) => m.role === 'tool')).toBe(true);
  });
});
