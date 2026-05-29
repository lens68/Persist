import { describe, expect, it } from 'vitest';
import {
  CreateSessionInputSchema,
  MessageSchema,
  RuntimeChunkSchema,
  SessionReplaySchema,
  SessionSchema,
  SessionSummarySchema,
} from './index.js';

describe('shared contracts', () => {
  it('validates session with nullable userId', () => {
    const session = SessionSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: null,
      metadata: { agent: 'v0' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(session.userId).toBeNull();
  });

  it('validates message as runtime artifact', () => {
    const msg = MessageSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440001',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      role: 'assistant',
      content: 'hello',
      completionState: 'completed',
      providerMetadata: {
        model: 'qwen-plus',
        usage: { totalTokens: 10 },
      },
      createdAt: new Date(),
      completedAt: new Date(),
    });
    expect(msg.providerMetadata?.model).toBe('qwen-plus');
  });

  it('validates runtime chunk union', () => {
    const chunk = RuntimeChunkSchema.parse({
      type: 'text-delta',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      messageId: '550e8400-e29b-41d4-a716-446655440001',
      timestamp: new Date(),
      delta: 'Hi',
    });
    expect(chunk.type).toBe('text-delta');
  });

  it('validates replay payload (v0.1-compatible defaults)', () => {
    const replay = SessionReplaySchema.parse({
      session: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      messages: [],
      reconstructedAt: new Date(),
    });
    expect(replay.messages).toEqual([]);
    expect(replay.memories).toEqual([]);
    expect(replay.injectionSnapshots).toEqual([]);
  });

  it('validates create session input', () => {
    const input = CreateSessionInputSchema.parse({ title: 'Test' });
    expect(input.title).toBe('Test');
  });

  it('validates SessionSummary with optional previewText', () => {
    const summary = SessionSummarySchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 0,
    });
    expect(summary.previewText).toBeUndefined();
    expect(summary.messageCount).toBe(0);
  });

  it('validates SessionSummary with previewText and messageCount', () => {
    const summary = SessionSummarySchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 3,
      previewText: 'Hello world',
    });
    expect(summary.previewText).toBe('Hello world');
    expect(summary.messageCount).toBe(3);
  });
});
