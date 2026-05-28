import type {
  MemoryInjectionSnapshot,
  MemoryStore,
  RuntimeChunk,
  SessionStore,
} from '@persist/shared';
import { performMemoryInjection, resolveActiveSummary } from '@persist/memory';
import type { InjectionSnapshotStore } from '@persist/shared';

export async function* runMemoryInjectionPhase(
  deps: {
    store: SessionStore;
    memoryStore: MemoryStore;
    injectionSnapshotStore: InjectionSnapshotStore;
  },
  params: { sessionId: string; triggerMessageId: string },
): AsyncGenerator<RuntimeChunk, MemoryInjectionSnapshot> {
  const { sessionId, triggerMessageId } = params;
  const updated = await deps.store.getSessionWithMessages(sessionId);
  if (!updated) {
    throw new Error('Session not found for memory injection');
  }

  const memories = await deps.memoryStore.listMemories(sessionId);
  const activeSummary = resolveActiveSummary(memories);
  const injection = performMemoryInjection({
    sessionId,
    triggerMessageId,
    messages: updated.messages,
    activeSummary,
  });

  const persistedSnapshot = await deps.injectionSnapshotStore.appendInjectionSnapshot(sessionId, {
    sessionId,
    triggerMessageId: injection.snapshot.triggerMessageId,
    injectedMemoryIds: injection.snapshot.injectedMemoryIds,
    resolvedMessages: injection.resolvedMessages,
    strategy: injection.snapshot.strategy,
  });

  yield {
    type: 'memory-injected',
    sessionId,
    timestamp: new Date(),
    snapshot: persistedSnapshot,
  };

  return persistedSnapshot;
}
