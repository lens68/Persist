import { describe, expect, it } from 'vitest';
import type { MemoryEntry, Message } from '@persist/shared';
import {
  buildMemorySystemMessage,
  CONTINUITY_SUMMARY_PREFIX,
  performMemoryInjection,
  resolveInjection,
} from '../index.js';

const sessionId = '550e8400-e29b-41d4-a716-446655440000';
const triggerMessageId = '550e8400-e29b-41d4-a716-446655440010';

function msg(id: string, role: Message['role'], content: string): Message {
  return {
    id,
    sessionId,
    role,
    content,
    completionState: 'completed',
    createdAt: new Date(),
  };
}

function activeSummary(id: string, content: string): MemoryEntry {
  return {
    id,
    sessionId,
    type: 'summary',
    content,
    createdAt: new Date(),
  };
}

describe('resolveInjection semantic invariants', () => {
  it('test 1: active summary is always resolvedMessages[0] as system', () => {
    const result = resolveInjection({
      sessionId,
      triggerMessageId,
      activeSummary: activeSummary('mem-1', 'prior context'),
      recentMessages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.resolvedMessages[0]?.role).toBe('system');
    expect(result.resolvedMessages[0]?.content).toContain(CONTINUITY_SUMMARY_PREFIX);
    expect(result.resolvedMessages[0]).toEqual(buildMemorySystemMessage('prior context'));
  });

  it('test 2: RECENT_K window includes trigger user message', () => {
    const messages = [
      msg('m1', 'user', 'a'),
      msg('m2', 'assistant', 'b'),
      msg('m3', 'user', 'c'),
      msg('m4', 'assistant', 'd'),
      msg(triggerMessageId, 'user', 'current'),
    ];

    const result = performMemoryInjection({
      sessionId,
      triggerMessageId,
      messages,
      activeSummary: null,
      policy: { injectionRecentK: 3 },
    });

    const tail = result.resolvedMessages.map((m) => m.content);
    expect(tail).toContain('current');
    expect(tail[tail.length - 1]).toBe('current');
  });

  it('test 3: no active summary → no system continuity message', () => {
    const result = resolveInjection({
      sessionId,
      triggerMessageId,
      activeSummary: null,
      recentMessages: [{ role: 'user', content: 'only' }],
    });

    expect(result.resolvedMessages.every((m) => m.role !== 'system')).toBe(true);
    expect(result.snapshot.injectedMemoryIds).toEqual([]);
  });

  it('test 4: snapshot.resolvedMessages deepEqual provider input', () => {
    const result = performMemoryInjection({
      sessionId,
      triggerMessageId,
      messages: [msg(triggerMessageId, 'user', 'q')],
      activeSummary: activeSummary('mem-1', 'ctx'),
      policy: { injectionRecentK: 6 },
    });

    expect(result.snapshot.resolvedMessages).toEqual(result.resolvedMessages);
    expect(result.snapshot.triggerMessageId).toBe(triggerMessageId);
    expect(result.snapshot.strategy).toBe('summary_plus_recent_k');
  });
});
