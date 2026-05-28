import type {
  ChatProvider,
  ProviderMetadata,
  RuntimeChunk,
  SessionStore,
  ToolCallMetadata,
} from '@persist/shared';
import { isObservabilityChunk } from '@persist/shared';

export interface ProviderChatPhaseResult {
  assistantMessageId?: string;
  providerMetadata?: ProviderMetadata;
  executionCompleted: boolean;
  toolCalls: ToolCallMetadata[];
}

export async function* runProviderChatPhase(
  provider: ChatProvider,
  store: SessionStore,
  params: {
    sessionId: string;
    messages: Parameters<ChatProvider['chat']>[0]['messages'];
    model?: string;
    signal?: AbortSignal;
    tools?: Parameters<ChatProvider['chat']>[0]['tools'];
  },
): AsyncGenerator<RuntimeChunk, ProviderChatPhaseResult> {
  const { sessionId, messages, model, signal, tools } = params;
  let assistantMessageId: string | undefined;
  let accumulated = '';
  let providerMetadata: ProviderMetadata | undefined;
  let executionCompleted = false;
  const streamedToolCalls: ToolCallMetadata[] = [];

  for await (const chunk of provider.chat({
    sessionId,
    messages,
    model,
    signal,
    tools,
  })) {
    if (isObservabilityChunk(chunk)) {
      continue;
    }

    if (chunk.type === 'tool-call-start' || chunk.type === 'tool-call-end') {
      if (chunk.type === 'tool-call-start') {
        streamedToolCalls.push({
          id: chunk.toolCallId,
          name: chunk.toolName,
          arguments: chunk.arguments,
        });
      }
      yield chunk;
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

  const toolCalls =
    providerMetadata?.toolCalls && providerMetadata.toolCalls.length > 0
      ? providerMetadata.toolCalls
      : streamedToolCalls;

  return {
    assistantMessageId,
    providerMetadata,
    executionCompleted,
    toolCalls,
  };
}
