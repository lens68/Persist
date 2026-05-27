import { describe, expect, it } from 'vitest';
import type {
  ChatProvider,
  ChatRequest,
  Message,
  RuntimeChunk,
  Session,
  SessionReplay,
  SessionWithMessages,
  CreateMessageInput,
  CreateSessionInput,
  SessionStore,
} from '@persist/shared';
import { executeChat } from './chat-execution.js';

class MemoryStore implements SessionStore {
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
    return {
      id: s.id,
      messages: s.messages,
      createdAt: now,
      updatedAt: now,
    };
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
    return { session: swm, messages: swm.messages, reconstructedAt: new Date() };
  }
}

class MockProvider implements ChatProvider {
  readonly id = 'mock';

  async *chat(request: ChatRequest): AsyncIterable<RuntimeChunk> {
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

describe('executeChat', () => {
  it('persists user and assistant messages through stream', async () => {
    const store = new MemoryStore();
    const session = await store.createSession();
    const chunks: RuntimeChunk[] = [];

    for await (const c of executeChat(
      { provider: new MockProvider(), store },
      { sessionId: session.id, userContent: 'hello' },
    )) {
      chunks.push(c);
    }

    const swm = await store.getSessionWithMessages(session.id);
    expect(swm?.messages.length).toBe(2);
    expect(swm?.messages[0]?.role).toBe('user');
    expect(swm?.messages[1]?.content).toBe('OK');
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });
});
