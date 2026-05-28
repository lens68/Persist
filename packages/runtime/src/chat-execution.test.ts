import { describe, expect, it } from 'vitest';
import type {
  ChatProvider,
  ChatRequest,
  CreateToolExecutionSnapshotInput,
  RuntimeChunk,
  ToolExecutionSnapshot,
  ToolExecutionSnapshotStore,
  ToolExecutor,
  ToolResult,
} from '@persist/shared';
import { isObservabilityChunk } from '@persist/shared';
import { QUERY_SALES_TOOL_DEFINITION } from '@persist/tool';
import { RuleBasedMemoryGenerator } from '@persist/memory';
import { executeChat } from './chat-execution.js';
import type {
  CreateMemoryEntryInput,
  CreateMemoryInjectionSnapshotInput,
  CreateMessageInput,
  CreateSessionInput,
  InjectionSnapshotStore,
  MemoryEntry,
  MemoryInjectionSnapshot,
  MemoryStore,
  Message,
  Session,
  SessionReplay,
  SessionStore,
  SessionWithMessages,
} from '@persist/shared';

class InMemoryToolExecutionSnapshotStore implements ToolExecutionSnapshotStore {
  snapshots: ToolExecutionSnapshot[] = [];

  async appendSnapshot(
    sessionId: string,
    input: CreateToolExecutionSnapshotInput,
  ): Promise<ToolExecutionSnapshot> {
    const snap: ToolExecutionSnapshot = {
      id: crypto.randomUUID(),
      sessionId,
      triggerMessageId: input.triggerMessageId,
      toolName: input.toolName,
      toolInput: input.toolInput,
      toolOutput: input.toolOutput,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      status: input.status,
      payloadTruncated: input.payloadTruncated,
    };
    this.snapshots.push(snap);
    return snap;
  }

  async listSnapshots(sessionId: string): Promise<ToolExecutionSnapshot[]> {
    return this.snapshots.filter((s) => s.sessionId === sessionId);
  }
}

class MockToolExecutor implements ToolExecutor {
  callCount = 0;
  lastCall: { toolName: string; input: unknown } | null = null;
  result: ToolResult = { success: true, output: { product: 'Widget A', value: 100 } };

  async call(toolName: string, input: unknown): Promise<ToolResult> {
    this.callCount++;
    this.lastCall = { toolName, input };
    return this.result;
  }
}

class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, { id: string; messages: Message[] }>();

  async createSession(_input?: CreateSessionInput): Promise<Session> {
    const id = crypto.randomUUID();
    this.sessions.set(id, { id, messages: [] });
    const now = new Date();
    return { id, createdAt: now, updatedAt: now };
  }

  async getSession(id: string): Promise<Session | null> {
    const s = this.sessions.get(id);
    if (!s) return null;
    const now = new Date();
    return { id: s.id, createdAt: now, updatedAt: now };
  }

  async getSessionWithMessages(id: string): Promise<SessionWithMessages | null> {
    const s = this.sessions.get(id);
    if (!s) return null;
    const now = new Date();
    return { id: s.id, messages: [...s.messages], createdAt: now, updatedAt: now };
  }

  async appendMessage(sessionId: string, input: CreateMessageInput): Promise<Message> {
    const s = this.sessions.get(sessionId)!;
    const msg: Message = {
      id: input.id ?? crypto.randomUUID(),
      sessionId,
      role: input.role,
      content: input.content,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      providerMetadata: input.providerMetadata,
      completionState: input.completionState ?? 'completed',
      createdAt: new Date(),
    };
    s.messages.push(msg);
    return msg;
  }

  async updateMessage(
    sessionId: string,
    messageId: string,
    patch: Partial<
      Pick<Message, 'content' | 'providerMetadata' | 'completionState' | 'completedAt'>
    >,
  ): Promise<Message> {
    const s = this.sessions.get(sessionId)!;
    const idx = s.messages.findIndex((m) => m.id === messageId);
    s.messages[idx] = { ...s.messages[idx]!, ...patch };
    return s.messages[idx]!;
  }

  async getReplay(sessionId: string): Promise<SessionReplay | null> {
    const swm = await this.getSessionWithMessages(sessionId);
    if (!swm) return null;
    const { messages, ...session } = swm;
    return {
      session,
      messages,
      memories: [],
      injectionSnapshots: [],
      toolExecutionSnapshots: [],
      reconstructedAt: new Date(),
    };
  }
}

class InMemoryMemoryStore implements MemoryStore {
  private entries: MemoryEntry[] = [];

  async appendMemory(sessionId: string, input: CreateMemoryEntryInput): Promise<MemoryEntry> {
    if (input.type === 'summary') {
      throw new Error('use replaceActiveSummary');
    }
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      sessionId,
      type: input.type,
      content: input.content,
      createdAt: new Date(),
    };
    this.entries.push(entry);
    return entry;
  }

  async listMemories(sessionId: string): Promise<MemoryEntry[]> {
    return this.entries.filter((e) => e.sessionId === sessionId);
  }

  async getActiveSummary(sessionId: string): Promise<MemoryEntry | null> {
    const active = this.entries.filter((e) => e.sessionId === sessionId && !e.supersededBy);
    return active.at(-1) ?? null;
  }

  async supersedeMemory(memoryId: string, supersededBy: string): Promise<MemoryEntry> {
    const e = this.entries.find((x) => x.id === memoryId)!;
    e.supersededBy = supersededBy;
    return e;
  }

  async replaceActiveSummary(
    sessionId: string,
    input: CreateMemoryEntryInput,
    previousMemoryId: string | null,
  ): Promise<MemoryEntry> {
    if (previousMemoryId) {
      await this.supersedeMemory(previousMemoryId, 'pending');
    }
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      sessionId,
      type: 'summary',
      content: input.content,
      sourceMessageIds: input.sourceMessageIds,
      createdAt: new Date(),
    };
    if (previousMemoryId) {
      const prev = this.entries.find((x) => x.id === previousMemoryId)!;
      prev.supersededBy = entry.id;
    }
    this.entries.push(entry);
    return entry;
  }

  seed(entry: MemoryEntry) {
    this.entries.push(entry);
  }
}

class InMemoryInjectionSnapshotStore implements InjectionSnapshotStore {
  snapshots: MemoryInjectionSnapshot[] = [];

  async appendInjectionSnapshot(
    sessionId: string,
    input: CreateMemoryInjectionSnapshotInput,
  ): Promise<MemoryInjectionSnapshot> {
    const snap: MemoryInjectionSnapshot = {
      id: crypto.randomUUID(),
      sessionId,
      triggerMessageId: input.triggerMessageId,
      injectedMemoryIds: input.injectedMemoryIds,
      resolvedMessages: input.resolvedMessages,
      strategy: input.strategy,
      createdAt: new Date(),
    };
    this.snapshots.push(snap);
    return snap;
  }

  async listInjectionSnapshots(sessionId: string): Promise<MemoryInjectionSnapshot[]> {
    return this.snapshots.filter((s) => s.sessionId === sessionId);
  }
}

class MockProvider implements ChatProvider {
  readonly id = 'mock';
  lastRequest: ChatRequest | null = null;
  chatCallCount = 0;
  mode: 'text' | 'tool' = 'text';

  async *chat(request: ChatRequest): AsyncIterable<RuntimeChunk> {
    this.lastRequest = request;
    this.chatCallCount++;
    const messageId = crypto.randomUUID();

    if (this.mode === 'tool' && this.chatCallCount === 1) {
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
        toolCallId: 'call_mock_1',
        toolName: 'query_sales',
        arguments: '{"metric":"revenue","period":"last_month"}',
      };
      yield {
        type: 'tool-call-end',
        sessionId: request.sessionId,
        timestamp: new Date(),
        toolCallId: 'call_mock_1',
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
          model: 'mock',
          toolCalls: [
            {
              id: 'call_mock_1',
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

function createDeps(provider: ChatProvider, toolExecutor = new MockToolExecutor()) {
  return {
    provider,
    store: new InMemorySessionStore(),
    memoryStore: new InMemoryMemoryStore(),
    injectionSnapshotStore: new InMemoryInjectionSnapshotStore(),
    memoryGenerator: new RuleBasedMemoryGenerator(),
    toolExecutor,
    toolDefinitions: [QUERY_SALES_TOOL_DEFINITION],
    toolExecutionSnapshotStore: new InMemoryToolExecutionSnapshotStore(),
  };
}

describe('executeChat', () => {
  it('persists user and assistant messages through stream', async () => {
    const provider = new MockProvider();
    const deps = createDeps(provider);
    const session = await deps.store.createSession({});
    const chunks: RuntimeChunk[] = [];

    for await (const c of executeChat(deps, {
      sessionId: session.id,
      userContent: 'hello',
    })) {
      chunks.push(c);
    }

    const swm = await deps.store.getSessionWithMessages(session.id);
    expect(swm?.messages.length).toBe(2);
    expect(swm?.messages[0]?.role).toBe('user');
    expect(swm?.messages[1]?.content).toBe('OK');
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
    expect(chunks.some((c) => c.type === 'memory-injected')).toBe(true);
  });

  it('uses bounded injection context instead of full history (FR-MEM-02)', async () => {
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
      id: '550e8400-e29b-41d4-a716-446655440099',
      sessionId: session.id,
      type: 'summary',
      content: 'prior condensed',
      createdAt: new Date('2020-01-01'),
    });

    for await (const _c of executeChat(deps, {
      sessionId: session.id,
      userContent: 'latest',
    })) {
      /* drain */
    }

    expect(provider.lastRequest?.messages[0]?.role).toBe('system');
    expect(provider.lastRequest?.messages[0]?.content).toContain('prior condensed');
    expect(provider.lastRequest!.messages.length).toBeLessThan(11);
  });

  it('observability chunks do not create extra messages (FR-MEM-14)', async () => {
    const deps = createDeps(new MockProvider());
    const session = await deps.store.createSession({});
    const chunks: RuntimeChunk[] = [];

    for await (const c of executeChat(deps, { sessionId: session.id, userContent: 'hi' })) {
      chunks.push(c);
    }

    const observability = chunks.filter(isObservabilityChunk);
    expect(observability.length).toBeGreaterThanOrEqual(1);
    expect(observability[0]?.type).toBe('memory-injected');

    const swm = await deps.store.getSessionWithMessages(session.id);
    expect(swm?.messages.length).toBe(2);
    expect(swm?.messages.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
  });

  it('runs generation after done(completed) without nesting executeChat (§9 step 11–15)', async () => {
    const provider = new MockProvider();
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

    expect(chunks.some((c) => c.type === 'memory-generated')).toBe(true);
    const active = await deps.memoryStore.getActiveSummary(session.id);
    expect(active?.type).toBe('summary');
    expect(active?.content).toContain('trigger');
    expect(provider.lastRequest?.messages.some((m) => m.role === 'user')).toBe(true);
  });

  it('passes toolDefinitions to provider #1 (FR-TOOL-02)', async () => {
    const provider = new MockProvider();
    const deps = createDeps(provider);
    const session = await deps.store.createSession({});
    for await (const _c of executeChat(deps, { sessionId: session.id, userContent: 'hi' })) {
      /* drain */
    }
    expect(provider.lastRequest?.tools?.length).toBe(1);
    expect(provider.lastRequest?.tools?.[0]?.name).toBe('query_sales');
  });
});

describe('executeChat tool path (v0.3)', () => {
  it('no tool_call: single provider, no snapshot, still generation when threshold met', async () => {
    const provider = new MockProvider();
    const toolExecutor = new MockToolExecutor();
    const deps = createDeps(provider, toolExecutor);
    const session = await deps.store.createSession({});

    for await (const _c of executeChat(deps, { sessionId: session.id, userContent: 'hi' })) {
      /* drain */
    }

    expect(provider.chatCallCount).toBe(1);
    expect(toolExecutor.callCount).toBe(0);
    expect(deps.toolExecutionSnapshotStore.snapshots.length).toBe(0);
  });

  it('with tool_call: two providers, one executor, two memory-injected', async () => {
    const provider = new MockProvider();
    provider.mode = 'tool';
    const toolExecutor = new MockToolExecutor();
    const deps = createDeps(provider, toolExecutor);
    const session = await deps.store.createSession({});
    const chunks: RuntimeChunk[] = [];

    for await (const c of executeChat(deps, {
      sessionId: session.id,
      userContent: 'top product last month',
    })) {
      chunks.push(c);
    }

    expect(provider.chatCallCount).toBe(2);
    expect(toolExecutor.callCount).toBe(1);
    expect(deps.toolExecutionSnapshotStore.snapshots.length).toBe(1);
    expect(chunks.filter((c) => c.type === 'memory-injected').length).toBe(2);
    expect(chunks.some((c) => c.type === 'tool-result')).toBe(true);

    const swm = await deps.store.getSessionWithMessages(session.id);
    expect(swm?.messages.some((m) => m.role === 'tool')).toBe(true);
  });

  it('provider #2 failed skips memory generation (IC-TOOL-10)', async () => {
    const provider = new MockProvider();
    provider.mode = 'tool';
    let calls = 0;
    const wrapped: ChatProvider = {
      id: 'wrapped',
      async *chat(request) {
        calls++;
        if (calls === 2) {
          const messageId = crypto.randomUUID();
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
        yield* provider.chat(request);
      },
    };

    const deps = createDeps(provider);
    deps.provider = wrapped;
    const session = await deps.store.createSession({});
    const chunks: RuntimeChunk[] = [];

    for await (const c of executeChat(deps, { sessionId: session.id, userContent: 'sales' })) {
      chunks.push(c);
    }

    expect(chunks.some((c) => c.type === 'memory-generated')).toBe(false);
    expect(calls).toBe(2);
  });

  it('tool failure still runs provider #2 and generation when #2 succeeds (IC-TOOL-10)', async () => {
    const provider = new MockProvider();
    provider.mode = 'tool';
    const toolExecutor = new MockToolExecutor();
    toolExecutor.result = {
      success: false,
      output: null,
      error: { code: 'tool_failed', message: 'simulated failure' },
    };
    const deps = createDeps(provider, toolExecutor);
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
      userContent: 'sales after tool error',
    })) {
      chunks.push(c);
    }

    expect(provider.chatCallCount).toBe(2);
    expect(toolExecutor.callCount).toBe(1);
    expect(deps.toolExecutionSnapshotStore.snapshots).toHaveLength(1);
    expect(deps.toolExecutionSnapshotStore.snapshots[0]?.status).toBe('failed');
    expect(chunks.some((c) => c.type === 'tool-result' && !c.success)).toBe(true);
    expect(chunks.some((c) => c.type === 'memory-generated')).toBe(true);

    const swm = await deps.store.getSessionWithMessages(session.id);
    expect(swm?.messages.some((m) => m.role === 'tool')).toBe(true);
  });

  it('emits tool-call-truncated through executeChat (IC-TOOL-06)', async () => {
    let providerCalls = 0;
    const provider: ChatProvider = {
      id: 'mock-multi-tool',
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
            type: 'done',
            sessionId: request.sessionId,
            messageId,
            completionState: 'completed',
            timestamp: new Date(),
            providerMetadata: {
              toolCalls: [
                { id: 'a', name: 'query_sales', arguments: '{}' },
                { id: 'b', name: 'other', arguments: '{}' },
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
        };
      },
    };

    const deps = createDeps(provider);
    const session = await deps.store.createSession({});
    const chunks: RuntimeChunk[] = [];
    for await (const c of executeChat(deps, {
      sessionId: session.id,
      userContent: 'multi tool',
    })) {
      chunks.push(c);
    }
    expect(chunks.some((c) => c.type === 'tool-call-truncated')).toBe(true);
    expect(deps.toolExecutionSnapshotStore.snapshots).toHaveLength(1);
  });
});
