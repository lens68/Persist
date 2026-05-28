import { describe, expect, it } from 'vitest';
import { executeChat } from './chat-execution.js';
import type { ChatProvider, ChatRequest, RuntimeChunk, ToolExecutor } from '@persist/shared';
import { QUERY_SALES_TOOL_DEFINITION } from '@persist/tool';
import { RuleBasedMemoryGenerator } from '@persist/memory';
import {
  InMemoryInjectionSnapshotStore,
  InMemoryMemoryStore,
  InMemorySessionStore,
  InMemoryToolSnapshotStore,
} from './test-helpers.js';

class SalesToolExecutor implements ToolExecutor {
  callCount = 0;
  async call(toolName: string) {
    this.callCount++;
    if (toolName !== 'query_sales') {
      return { success: false, output: null, error: { code: 'unknown', message: 'unknown' } };
    }
    return { success: true, output: { product: 'Widget A', value: 12000, metric: 'revenue' } };
  }
}

describe('sales e2e mock chain (FR-TOOL-16)', () => {
  it('FC arguments → query_sales → provider #2 answer', async () => {
    let providerCalls = 0;
    const provider: ChatProvider = {
      id: 'mock',
      async *chat(request: ChatRequest): AsyncIterable<RuntimeChunk> {
        providerCalls++;
        const messageId = crypto.randomUUID();
        if (providerCalls === 1) {
          yield {
            type: 'message-start',
            sessionId: request.sessionId,
            messageId,
            role: 'assistant',
            timestamp: new Date(),
          };
          yield {
            type: 'tool-call-start',
            sessionId: request.sessionId,
            timestamp: new Date(),
            toolCallId: 'call_1',
            toolName: 'query_sales',
            arguments: '{"metric":"revenue","period":"last_month"}',
          };
          yield {
            type: 'tool-call-end',
            sessionId: request.sessionId,
            timestamp: new Date(),
            toolCallId: 'call_1',
            toolName: 'query_sales',
            arguments: '{"metric":"revenue","period":"last_month"}',
          };
          yield {
            type: 'message-end',
            sessionId: request.sessionId,
            messageId,
            timestamp: new Date(),
            content: '',
          };
          yield {
            type: 'done',
            sessionId: request.sessionId,
            messageId,
            completionState: 'completed',
            timestamp: new Date(),
            providerMetadata: {
              toolCalls: [
                {
                  id: 'call_1',
                  name: 'query_sales',
                  arguments: '{"metric":"revenue","period":"last_month"}',
                },
              ],
            },
          };
          return;
        }
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
          delta: 'Widget A leads sales.',
        };
        yield {
          type: 'message-end',
          sessionId: request.sessionId,
          messageId,
          timestamp: new Date(),
          content: 'Widget A leads sales.',
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

    const store = new InMemorySessionStore();
    const toolExecutor = new SalesToolExecutor();
    const toolExecutionSnapshotStore = new InMemoryToolSnapshotStore();
    const session = await store.createSession({});

    for await (const _c of executeChat(
      {
        provider,
        store,
        memoryStore: new InMemoryMemoryStore(),
        injectionSnapshotStore: new InMemoryInjectionSnapshotStore(),
        memoryGenerator: new RuleBasedMemoryGenerator(),
        toolExecutor,
        toolDefinitions: [QUERY_SALES_TOOL_DEFINITION],
        toolExecutionSnapshotStore,
      },
      { sessionId: session.id, userContent: 'top product last month' },
    )) {
      /* drain */
    }

    expect(toolExecutor.callCount).toBe(1);
    expect(providerCalls).toBe(2);
    const swm = await store.getSessionWithMessages(session.id);
    expect(swm?.messages.some((m) => m.role === 'tool')).toBe(true);
    expect(swm?.messages.at(-1)?.content).toContain('Widget');
    expect(toolExecutionSnapshotStore.snapshots.length).toBe(1);
  });
});
