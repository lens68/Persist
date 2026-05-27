import { describe, expect, it } from 'vitest';
import {
  CreateMemoryEntryInputSchema,
  CreateMemoryInjectionSnapshotInputSchema,
  MemoryEntrySchema,
  MemoryInjectionSnapshotSchema,
  MemoryInjectedChunkSchema,
  MemoryGeneratedChunkSchema,
  SessionReplaySchema,
  RuntimeChunkSchema,
  isExecutionChunk,
  isObservabilityChunk,
} from './index.js';

const sessionId = '550e8400-e29b-41d4-a716-446655440000';
const triggerMessageId = '550e8400-e29b-41d4-a716-446655440010';
const memoryId = '550e8400-e29b-41d4-a716-446655440020';
const snapshotId = '550e8400-e29b-41d4-a716-446655440030';

describe('v0.2 memory contracts', () => {
  it('validates MemoryEntry summary artifact', () => {
    const entry = MemoryEntrySchema.parse({
      id: memoryId,
      sessionId,
      type: 'summary',
      content: 'Prior experiment: user tested prompt A.',
      sourceMessageIds: [triggerMessageId],
      createdAt: new Date(),
    });
    expect(entry.type).toBe('summary');
    expect(entry.supersededBy).toBeUndefined();
  });

  it('validates superseded MemoryEntry', () => {
    const entry = MemoryEntrySchema.parse({
      id: memoryId,
      sessionId,
      type: 'summary',
      content: 'old',
      supersededBy: '550e8400-e29b-41d4-a716-446655440099',
      createdAt: new Date(),
    });
    expect(entry.supersededBy).toBeDefined();
  });

  it('validates MemoryInjectionSnapshot with resolvedMessages (IC-MEM-04)', () => {
    const snapshot = MemoryInjectionSnapshotSchema.parse({
      id: snapshotId,
      sessionId,
      triggerMessageId,
      injectedMemoryIds: [memoryId],
      resolvedMessages: [
        {
          role: 'system',
          content: 'Previous runtime continuity summary: condensed context',
        },
        { role: 'user', content: 'hello' },
      ],
      strategy: 'summary_plus_recent_k',
      createdAt: new Date(),
    });
    expect(snapshot.resolvedMessages).toHaveLength(2);
    expect(snapshot.triggerMessageId).toBe(triggerMessageId);
  });

  it('validates create inputs without id/timestamps', () => {
    const memoryInput = CreateMemoryEntryInputSchema.parse({
      sessionId,
      type: 'summary',
      content: 'x',
    });
    expect(memoryInput.id).toBeUndefined();

    const snapInput = CreateMemoryInjectionSnapshotInputSchema.parse({
      sessionId,
      triggerMessageId,
      injectedMemoryIds: [],
      resolvedMessages: [{ role: 'user', content: 'hi' }],
      strategy: 'summary_plus_recent_k',
    });
    expect(snapInput.triggerMessageId).toBe(triggerMessageId);
  });

  it('validates memory-injected observability chunk', () => {
    const snapshot = MemoryInjectionSnapshotSchema.parse({
      id: snapshotId,
      sessionId,
      triggerMessageId,
      injectedMemoryIds: [memoryId],
      resolvedMessages: [{ role: 'user', content: 'q' }],
      strategy: 'summary_plus_recent_k',
      createdAt: new Date(),
    });

    const chunk = MemoryInjectedChunkSchema.parse({
      type: 'memory-injected',
      sessionId,
      timestamp: new Date(),
      snapshot,
    });
    expect(isObservabilityChunk(chunk)).toBe(true);
    expect(isExecutionChunk(chunk)).toBe(false);
  });

  it('validates memory-generated observability chunk', () => {
    const memory = MemoryEntrySchema.parse({
      id: memoryId,
      sessionId,
      type: 'summary',
      content: 'new summary',
      createdAt: new Date(),
    });

    const chunk = MemoryGeneratedChunkSchema.parse({
      type: 'memory-generated',
      sessionId,
      timestamp: new Date(),
      memory,
    });
    expect(isObservabilityChunk(chunk)).toBe(true);
  });

  it('validates execution chunks are not observability', () => {
    const chunk = RuntimeChunkSchema.parse({
      type: 'text-delta',
      sessionId,
      messageId: '550e8400-e29b-41d4-a716-446655440001',
      timestamp: new Date(),
      delta: 'x',
    });
    expect(isExecutionChunk(chunk)).toBe(true);
    expect(isObservabilityChunk(chunk)).toBe(false);
  });

  it('validates extended SessionReplay (FR-MEM-09)', () => {
    const replay = SessionReplaySchema.parse({
      session: {
        id: sessionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      messages: [],
      reconstructedAt: new Date(),
    });
    expect(replay.memories).toEqual([]);
    expect(replay.injectionSnapshots).toEqual([]);
  });

  it('validates SessionReplay with memories and snapshots', () => {
    const replay = SessionReplaySchema.parse({
      session: {
        id: sessionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      messages: [],
      memories: [
        {
          id: memoryId,
          sessionId,
          type: 'summary',
          content: 's',
          createdAt: new Date(),
        },
      ],
      injectionSnapshots: [
        {
          id: snapshotId,
          sessionId,
          triggerMessageId,
          injectedMemoryIds: [memoryId],
          resolvedMessages: [{ role: 'user', content: 'q' }],
          strategy: 'summary_plus_recent_k',
          createdAt: new Date(),
        },
      ],
      reconstructedAt: new Date(),
    });
    expect(replay.memories).toHaveLength(1);
    expect(replay.injectionSnapshots).toHaveLength(1);
  });

  it('rejects invalid memory type', () => {
    expect(() =>
      MemoryEntrySchema.parse({
        id: memoryId,
        sessionId,
        type: 'embedding',
        content: 'x',
        createdAt: new Date(),
      }),
    ).toThrow();
  });
});
