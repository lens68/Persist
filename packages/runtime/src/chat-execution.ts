import type {
  ChatProvider,
  InjectionSnapshotStore,
  MemoryGenerator,
  MemoryStore,
  ProviderMetadata,
  RuntimeChunk,
  SessionStore,
} from '@persist/shared';
import { isObservabilityChunk } from '@persist/shared';
import { performMemoryInjection, resolveActiveSummary } from '@persist/memory';
import type { ChatExecutionInput } from './chat-execution-types.js';
import { runMemoryGenerationPipeline } from './memory-generation-pipeline.js';

export type { ChatExecutionInput } from './chat-execution-types.js';

export interface ChatExecutionDeps {
  provider: ChatProvider;
  store: SessionStore;
  memoryStore: MemoryStore;
  injectionSnapshotStore: InjectionSnapshotStore;
  memoryGenerator: MemoryGenerator;
}

/**
 * Persistence-aware chat execution with continuity injection + post-execution generation (§9).
 */
export async function* executeChat(
  deps: ChatExecutionDeps,
  input: ChatExecutionInput,
): AsyncIterable<RuntimeChunk> {
  const { provider, store, memoryStore, injectionSnapshotStore, memoryGenerator } = deps;
  const { sessionId, userContent, model, signal } = input;

  const session = await store.getSessionWithMessages(sessionId);
  if (!session) {
    yield {
      type: 'error',
      sessionId,
      timestamp: new Date(),
      code: 'session_not_found',
      message: `Session ${sessionId} not found`,
      recoverable: false,
    };
    yield {
      type: 'done',
      sessionId,
      completionState: 'failed',
      timestamp: new Date(),
    };
    return;
  }

  const userMessage = await store.appendMessage(sessionId, {
    role: 'user',
    content: userContent,
    completionState: 'completed',
  });
  const triggerMessageId = userMessage.id;

  const updated = await store.getSessionWithMessages(sessionId);
  if (!updated) {
    yield {
      type: 'error',
      sessionId,
      timestamp: new Date(),
      code: 'session_load_failed',
      message: 'Failed to reload session after user message',
    };
    return;
  }

  const memories = await memoryStore.listMemories(sessionId);
  const activeSummary = resolveActiveSummary(memories);

  const injection = performMemoryInjection({
    sessionId,
    triggerMessageId,
    messages: updated.messages,
    activeSummary,
  });

  const persistedSnapshot = await injectionSnapshotStore.appendInjectionSnapshot(sessionId, {
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

  let assistantMessageId: string | undefined;
  let accumulated = '';
  let providerMetadata: ProviderMetadata | undefined;
  let executionCompleted = false;

  for await (const chunk of provider.chat({
    sessionId,
    messages: persistedSnapshot.resolvedMessages,
    model,
    signal,
  })) {
    if (isObservabilityChunk(chunk)) {
      continue;
    }

    if (chunk.type === 'message-start') {
      assistantMessageId = chunk.messageId;
      await store.appendMessage(sessionId, {
        id: chunk.messageId,
        role: 'assistant',
        content: '',
        completionState: 'streaming',
      });
    }

    if (chunk.type === 'text-delta' && assistantMessageId) {
      accumulated += chunk.delta;
      await store.updateMessage(sessionId, assistantMessageId, {
        content: accumulated,
        completionState: 'streaming',
      });
    }

    if (chunk.type === 'usage' && assistantMessageId) {
      providerMetadata = {
        ...providerMetadata,
        usage: chunk.usage,
      };
      await store.updateMessage(sessionId, assistantMessageId, {
        providerMetadata,
      });
    }

    if (chunk.type === 'message-end' && assistantMessageId) {
      accumulated = chunk.content;
      await store.updateMessage(sessionId, assistantMessageId, {
        content: accumulated,
        completionState: 'streaming',
      });
    }

    if (chunk.type === 'done') {
      if (chunk.providerMetadata) {
        providerMetadata = { ...providerMetadata, ...chunk.providerMetadata };
      }
      if (assistantMessageId) {
        await store.updateMessage(sessionId, assistantMessageId, {
          content: accumulated,
          completionState: chunk.completionState === 'completed' ? 'completed' : 'failed',
          providerMetadata,
          completedAt: new Date(),
        });
      }
      if (chunk.completionState === 'completed') {
        executionCompleted = true;
      }
    }

    if (chunk.type === 'error' && assistantMessageId) {
      await store.updateMessage(sessionId, assistantMessageId, {
        content: accumulated,
        completionState: 'failed',
        completedAt: new Date(),
      });
    }

    yield chunk;
  }

  if (executionCompleted) {
    for await (const genChunk of runMemoryGenerationPipeline({
      sessionId,
      store,
      memoryStore,
      memoryGenerator,
    })) {
      yield genChunk;
    }
  }
}
