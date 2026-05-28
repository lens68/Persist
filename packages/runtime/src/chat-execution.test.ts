import { describe, expect, it } from 'vitest';
import type {
  ChatProvider,
  ChatRequest,
  ExecutionPlan,
  RuntimeChunk,
  ToolExecutor,
  ToolResult,
} from '@persist/shared';
import { isObservabilityChunk } from '@persist/shared';
import { RuleBasedMemoryGenerator } from '@persist/memory';
import { RuleBasedPlanGenerator } from '@persist/planning';
import { QUERY_SALES_TOOL_DEFINITION } from '@persist/tool';
import { executeChat } from './chat-execution.js';
import {
  createMockPlanGenerator,
  InMemoryInjectionSnapshotStore,
  InMemoryMemoryStore,
  InMemoryPlanSnapshotStore,
  InMemorySessionStore,
  InMemoryToolSnapshotStore,
} from './test-helpers.js';

class MockToolExecutor implements ToolExecutor {
  callCount = 0;
  lastCall: { toolName: string; input: unknown } | null = null;
  result: ToolResult = { success: true, output: { product: 'Widget A', value: 12000 } };

  async call(toolName: string, input: unknown): Promise<ToolResult> {
    this.callCount++;
    this.lastCall = { toolName, input };
    return this.result;
  }
}

class MockProvider implements ChatProvider {
  readonly id = 'mock';
  requests: ChatRequest[] = [];
  chatCallCount = 0;
  failSynthesis = false;

  async *chat(request: ChatRequest): AsyncIterable<RuntimeChunk> {
    this.requests.push(request);
    this.chatCallCount++;
    const messageId = crypto.randomUUID();

    if (this.failSynthesis) {
      yield {
        type: 'message-start',
        sessionId: request.sessionId,
        messageId,
        role: 'assistant',
        timestamp: new Date(),
      };
      yield {
        type: 'done',
        sessionId: request.sessionId,
        messageId,
        completionState: 'failed',
        timestamp: new Date(),
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
      delta: 'OK',
    };
    yield {
      type: 'message-end',
      sessionId: request.sessionId,
      messageId,
      timestamp: new Date(),
      content: 'OK',
    };
    yield {
      type: 'done',
      sessionId: request.sessionId,
      messageId,
      completionState: 'completed',
      timestamp: new Date(),
      providerMetadata: { model: 'mock' },
    };
  }
}

function createDeps(
  provider: ChatProvider,
  options?: {
    planGenerator?: ReturnType<typeof createMockPlanGenerator>;
    toolExecutor?: MockToolExecutor;
  },
) {
  return {
    provider,
    planGenerator: options?.planGenerator ?? new RuleBasedPlanGenerator(),
    planSnapshotStore: new InMemoryPlanSnapshotStore(),
    store: new InMemorySessionStore(),
    memoryStore: new InMemoryMemoryStore(),
    injectionSnapshotStore: new InMemoryInjectionSnapshotStore(),
    memoryGenerator: new RuleBasedMemoryGenerator(),
    toolExecutor: options?.toolExecutor ?? new MockToolExecutor(),
    toolDefinitions: [QUERY_SALES_TOOL_DEFINITION],
    toolExecutionSnapshotStore: new InMemoryToolSnapshotStore(),
  };
}

describe('executeChat (v0.4 planning)', () => {
  it('persists user and single synthesis assistant (IC-PLAN-10)', async () => {
    const provider = new MockProvider();
    const deps = createDeps(provider);
    const session = await deps.store.createSession({});

    for await (const _c of executeChat(deps, { sessionId: session.id, userContent: '你好' })) {
      /* drain */
    }

    const swm = await deps.store.getSessionWithMessages(session.id);
    expect(swm?.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(swm?.messages[0]?.role).toBe('user');
    expect(provider.chatCallCount).toBe(1);
    expect(provider.requests[0]?.tools).toBeUndefined();
  });

  it('IC-PLAN-09: synthesis messages include tool role after execution', async () => {
    const provider = new MockProvider();
    const toolExecutor = new MockToolExecutor();
    const deps = createDeps(provider, { toolExecutor });
    const session = await deps.store.createSession({});

    for await (const _c of executeChat(deps, {
      sessionId: session.id,
      userContent: '请查询上个月 revenue 销量第一',
    })) {
      /* drain */
    }

    expect(toolExecutor.callCount).toBe(1);
    expect(provider.requests[0]?.messages.some((m) => m.role === 'tool')).toBe(true);
    const toolMsg = provider.requests[0]?.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('Widget A');
  });

  it('single memory injection per turn (ADR-PLAN-06)', async () => {
    const deps = createDeps(new MockProvider());
    const session = await deps.store.createSession({});
    const chunks: RuntimeChunk[] = [];
    for await (const c of executeChat(deps, { sessionId: session.id, userContent: 'hi' })) {
      chunks.push(c);
    }
    expect(chunks.filter((c) => c.type === 'memory-injected').length).toBe(1);
  });

  it('emits plan-generated and executes one tool (sales)', async () => {
    const deps = createDeps(new MockProvider());
    const session = await deps.store.createSession({});
    const chunks: RuntimeChunk[] = [];
    for await (const c of executeChat(deps, {
      sessionId: session.id,
      userContent: 'top revenue last month',
    })) {
      chunks.push(c);
    }
    expect(chunks.some((c) => c.type === 'plan-generated')).toBe(true);
    expect(chunks.some((c) => c.type === 'tool-result')).toBe(true);
    expect(deps.toolExecutionSnapshotStore.snapshots[0]?.planId).toBeDefined();
    expect(deps.toolExecutionSnapshotStore.snapshots[0]?.planStepId).toBeDefined();
  });

  it('scenario 2: two tool steps → one executed + plan-step-truncated', async () => {
    const comparePlan: ExecutionPlan = {
      goal: 'Compare',
      steps: [
        {
          id: 't1',
          type: 'tool',
          description: 'm',
          toolName: 'query_sales',
          input: { metric: 'revenue', period: 'last_month' },
        },
        {
          id: 't2',
          type: 'tool',
          description: 'q',
          toolName: 'query_sales',
          input: { metric: 'revenue', period: 'last_quarter' },
        },
        { id: 'r1', type: 'response', description: 'answer' },
      ],
    };
    const toolExecutor = new MockToolExecutor();
    const deps = createDeps(new MockProvider(), {
      planGenerator: createMockPlanGenerator(comparePlan),
      toolExecutor,
    });
    const session = await deps.store.createSession({});
    const chunks: RuntimeChunk[] = [];
    for await (const c of executeChat(deps, {
      sessionId: session.id,
      userContent: '对比',
    })) {
      chunks.push(c);
    }
    expect(toolExecutor.callCount).toBe(1);
    expect(chunks.some((c) => c.type === 'plan-step-truncated')).toBe(true);
    expect(chunks.some((c) => c.type === 'tool-call-truncated')).toBe(false);
    const trace = deps.planSnapshotStore.snapshots.at(-1)?.executionTrace;
    expect(trace?.find((t) => t.stepId === 't1')?.status).toBe('completed');
    expect(trace?.find((t) => t.stepId === 't2')?.status).toBe('truncated');
  });

  it('plan-invalid still runs synthesis (IC-PLAN-08)', async () => {
    const badPlan: ExecutionPlan = {
      goal: 'bad',
      steps: [
        {
          id: 't1',
          type: 'tool',
          description: 'x',
          toolName: 'unknown_tool',
          input: {},
        },
        { id: 'r1', type: 'response', description: 'r' },
      ],
    };
    const provider = new MockProvider();
    const toolExecutor = new MockToolExecutor();
    const deps = createDeps(provider, {
      planGenerator: createMockPlanGenerator(badPlan),
      toolExecutor,
    });
    const session = await deps.store.createSession({});
    for await (const _c of executeChat(deps, { sessionId: session.id, userContent: 'x' })) {
      /* drain */
    }
    expect(toolExecutor.callCount).toBe(0);
    expect(deps.planSnapshotStore.snapshots.some((s) => s.status === 'invalid')).toBe(true);
    expect(provider.chatCallCount).toBe(1);
  });

  it('tool failure still runs synthesis and memory generation when threshold met (IC-PLAN-08)', async () => {
    const toolExecutor = new MockToolExecutor();
    toolExecutor.result = {
      success: false,
      output: null,
      error: { code: 'fail', message: 'simulated' },
    };
    const provider = new MockProvider();
    const deps = createDeps(provider, { toolExecutor });
    const session = await deps.store.createSession({});

    for (let i = 0; i < 6; i++) {
      await deps.store.appendMessage(session.id, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `seed-${i}`,
        completionState: 'completed',
      });
    }

    const chunks: RuntimeChunk[] = [];
    for await (const c of executeChat(deps, {
      sessionId: session.id,
      userContent: 'revenue top last month after tool error',
    })) {
      chunks.push(c);
    }

    expect(toolExecutor.callCount).toBe(1);
    expect(provider.chatCallCount).toBe(1);
    expect(chunks.some((c) => c.type === 'memory-generated')).toBe(true);
    expect(provider.requests[0]?.messages.some((m) => m.role === 'tool')).toBe(true);
  });

  it('tool failure still runs synthesis without generation when below threshold', async () => {
    const toolExecutor = new MockToolExecutor();
    toolExecutor.result = {
      success: false,
      output: null,
      error: { code: 'fail', message: 'simulated' },
    };
    const provider = new MockProvider();
    const deps = createDeps(provider, { toolExecutor });
    const session = await deps.store.createSession({});
    const chunks: RuntimeChunk[] = [];
    for await (const c of executeChat(deps, {
      sessionId: session.id,
      userContent: 'revenue top last month',
    })) {
      chunks.push(c);
    }
    expect(toolExecutor.callCount).toBe(1);
    expect(provider.chatCallCount).toBe(1);
    expect(chunks.some((c) => c.type === 'memory-generated')).toBe(false);
  });

  it('synthesis failure skips memory generation', async () => {
    const provider = new MockProvider();
    provider.failSynthesis = true;
    const deps = createDeps(provider);
    const session = await deps.store.createSession({});
    for (let i = 0; i < 6; i++) {
      await deps.store.appendMessage(session.id, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `seed-${i}`,
        completionState: 'completed',
      });
    }
    const chunks: RuntimeChunk[] = [];
    for await (const c of executeChat(deps, { sessionId: session.id, userContent: 'trigger' })) {
      chunks.push(c);
    }
    expect(chunks.some((c) => c.type === 'memory-generated')).toBe(false);
  });

  it('observability chunks do not create extra messages (FR-MEM-14)', async () => {
    const deps = createDeps(new MockProvider());
    const session = await deps.store.createSession({});
    const chunks: RuntimeChunk[] = [];
    for await (const c of executeChat(deps, { sessionId: session.id, userContent: 'hi' })) {
      chunks.push(c);
    }
    const observability = chunks.filter(isObservabilityChunk);
    expect(observability.some((c) => c.type === 'memory-injected')).toBe(true);
    expect(observability.some((c) => c.type === 'plan-generated')).toBe(true);
    const swm = await deps.store.getSessionWithMessages(session.id);
    expect(swm?.messages.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
  });

  it('uses bounded injection context (FR-MEM-02)', async () => {
    const provider = new MockProvider();
    const deps = createDeps(provider);
    const session = await deps.store.createSession({});
    for (let i = 0; i < 10; i++) {
      await deps.store.appendMessage(session.id, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `m${i}`,
        completionState: 'completed',
      });
    }
    deps.memoryStore.seed({
      id: crypto.randomUUID(),
      sessionId: session.id,
      type: 'summary',
      content: 'prior condensed',
      createdAt: new Date('2020-01-01'),
    });
    for await (const _c of executeChat(deps, { sessionId: session.id, userContent: 'latest' })) {
      /* drain */
    }
    const injection = deps.injectionSnapshotStore.snapshots[0];
    expect(injection?.resolvedMessages[0]?.role).toBe('system');
    expect(injection!.resolvedMessages.length).toBeLessThan(12);
  });
});
