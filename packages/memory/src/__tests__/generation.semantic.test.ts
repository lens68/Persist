import { describe, expect, it } from 'vitest';
import type { MemoryEntry, Message } from '@persist/shared';
import {
  planMemoryGeneration,
  resolveGenerationInput,
  resolveUnsummarizedMessages,
  shouldGenerateMemory,
  truncateSummary,
} from '../index.js';

const sessionId = '550e8400-e29b-41d4-a716-446655440000';

function msg(id: string, content: string): Message {
  return {
    id,
    sessionId,
    role: 'user',
    content,
    completionState: 'completed',
    createdAt: new Date(),
  };
}

describe('generation semantic invariants', () => {
  it('IC-MEM-02: excludes messages covered by active summary sources', () => {
    const messages = [msg('m1', 'a'), msg('m2', 'b'), msg('m3', 'c')];
    const active: MemoryEntry = {
      id: 's1',
      sessionId,
      type: 'summary',
      content: 'sum',
      sourceMessageIds: ['m1', 'm2'],
      createdAt: new Date(),
    };

    expect(resolveUnsummarizedMessages(messages, active).map((m) => m.id)).toEqual(['m3']);

    const input = resolveGenerationInput({ sessionId, messages, activeSummary: active });
    expect(input.unsummarizedMessages.map((m) => m.id)).toEqual(['m3']);
    expect(input.sourceMessageIds).toEqual(['m3']);
    expect(input.activeSummary?.id).toBe('s1');
  });

  it('CFG-MEM-01: shouldGenerateMemory uses message count threshold', () => {
    expect(shouldGenerateMemory(7, { generationMessageThreshold: 8 })).toBe(false);
    expect(shouldGenerateMemory(8, { generationMessageThreshold: 8 })).toBe(true);
  });

  it('planMemoryGeneration skips input when below threshold', () => {
    const plan = planMemoryGeneration({
      sessionId,
      messages: [msg('m1', 'a')],
      activeSummary: null,
      policy: { generationMessageThreshold: 8 },
    });
    expect(plan.shouldGenerate).toBe(false);
    expect(plan.input).toBeNull();
  });

  it('truncateSummary respects max chars', () => {
    expect(truncateSummary('abcdef', { summaryMaxChars: 3 })).toBe('abc');
  });

  it('uses createdAt tail when active summary has no sourceMessageIds', () => {
    const old = msg('m1', 'a');
    old.createdAt = new Date('2020-01-01');
    const newer = msg('m2', 'b');
    newer.createdAt = new Date('2025-01-01');
    const active: MemoryEntry = {
      id: 's1',
      sessionId,
      type: 'summary',
      content: 'sum',
      createdAt: new Date('2024-01-01'),
    };
    expect(resolveUnsummarizedMessages([old, newer], active).map((m) => m.id)).toEqual(['m2']);
  });
});
