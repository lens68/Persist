import type { ChatProvider } from '@persist/shared';
import { toChatMessages } from '@persist/shared';
import type { ProviderMetadata, RuntimeChunk } from '@persist/shared';
import type { SessionStore } from '@persist/shared';

export interface ChatExecutionInput {
  sessionId: string;
  userContent: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ChatExecutionDeps {
  provider: ChatProvider;
  store: SessionStore;
}

/**
 * Persistence-aware chat execution.
 * Yields RuntimeChunks (runtime events) while persisting lifecycle state.
 */
export async function* executeChat(
  deps: ChatExecutionDeps,
  input: ChatExecutionInput,
): AsyncIterable<RuntimeChunk> {
  const { provider, store } = deps;
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

  await store.appendMessage(sessionId, {
    role: 'user',
    content: userContent,
    completionState: 'completed',
  });

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

  let assistantMessageId: string | undefined;
  let accumulated = '';
  let providerMetadata: ProviderMetadata | undefined;

  for await (const chunk of provider.chat({
    sessionId,
    messages: toChatMessages(updated.messages),
    model,
    signal,
  })) {
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
}
