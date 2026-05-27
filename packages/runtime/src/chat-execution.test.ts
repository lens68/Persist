import { describe, expect, it } from 'vitest';
import type {
  ChatProvider,
  ChatRequest,
  CreateMemoryEntryInput,
  CreateMemoryInjectionSnapshotInput,
  CreateMessageInput,
  CreateSessionInput,
  InjectionSnapshotStore,
  MemoryEntry,
  MemoryInjectionSnapshot,
  MemoryStore,
  Message,
  RuntimeChunk,
  Session,
  SessionReplay,
  SessionStore,
  SessionWithMessages,
} from '@persist/shared';
import { isObservabilityChunk } from '@persist/shared';
import { RuleBasedMemoryGenerator } from '@persist/memory';
import { executeChat } from './chat-execution.js';

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

  async *chat(request: ChatRequest): AsyncIterable<RuntimeChunk> {
    this.lastRequest = request;
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

function createDeps(provider: MockProvider) {
  return {
    provider,
    store: new InMemorySessionStore(),
    memoryStore: new InMemoryMemoryStore(),
    injectionSnapshotStore: new InMemoryInjectionSnapshotStore(),
    memoryGenerator: new RuleBasedMemoryGenerator(),
  };
}

describe('executeChat', () => {
  it('persists user and assistant messages through stream', async () => {
    const provider = new MockProvider();
    const deps = createDeps(provider);
    const session = await deps.store.createSession();
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
    const session = await deps.store.createSession();

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
    const session = await deps.store.createSession();
    const chunks: RuntimeChunk[] = [];

    for await (const c of executeChat(deps, { sessionId: session.id, userContent: 'hi' })) {
      chunks.push(c);
    }

    const observability = chunks.filter(isObservabilityChunk);
    expect(observability.length).toBe(1);
    expect(observability[0]?.type).toBe('memory-injected');

    const swm = await deps.store.getSessionWithMessages(session.id);
    expect(swm?.messages.length).toBe(2);
    expect(swm?.messages.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
  });

  it('runs generation after done(completed) without nesting executeChat (§9 step 11–15)', async () => {
    const provider = new MockProvider();
    const deps = createDeps(provider);
    const session = await deps.store.createSession();

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
});
