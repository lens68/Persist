import type {
  MemoryInjectionSnapshot,
  MemoryStore,
  Message,
  RuntimeChunk,
  SessionStore,
  ToolExecutionContext,
  ToolExecutionSnapshotStore,
  ToolExecutor,
  ToolExecutionStatus,
} from '@persist/shared';
import { TOOL_RUNTIME_DEFAULTS } from '@persist/shared';
import { performMemoryInjection, resolveActiveSummary } from '@persist/memory';
import type { InjectionSnapshotStore } from '@persist/shared';
import { truncatePayload, truncateToolCalls } from '@persist/tool';

function parseToolArguments(args: string): unknown {
  try {
    return JSON.parse(args) as unknown;
  } catch {
    return args;
  }
}

async function executeToolWithTimeout(
  executor: ToolExecutor,
  toolName: string,
  input: unknown,
  context: ToolExecutionContext,
  timeoutMs: number = TOOL_RUNTIME_DEFAULTS.toolTimeoutMs,
): Promise<{ result: Awaited<ReturnType<ToolExecutor['call']>>; status: ToolExecutionStatus }> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ kind: 'timeout' }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
  });

  try {
    const raced = await Promise.race([
      executor.call(toolName, input, context).then((result) => ({ kind: 'result' as const, result })),
      timeoutPromise,
    ]);
    if (raced.kind === 'timeout') {
      return {
        result: {
          success: false,
          output: null,
          error: { code: 'timeout', message: `Tool ${toolName} timed out after ${timeoutMs}ms` },
        },
        status: 'timeout',
      };
    }
    return {
      result: raced.result,
      status: raced.result.success ? 'completed' : 'failed',
    };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

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

export async function* executeToolCallPhase(
  deps: {
    store: SessionStore;
    toolExecutor: ToolExecutor;
    toolExecutionSnapshotStore: ToolExecutionSnapshotStore;
  },
  params: {
    sessionId: string;
    triggerMessageId: string;
    toolCalls: { id: string; name: string; arguments: string }[];
    signal?: AbortSignal;
  },
): AsyncGenerator<RuntimeChunk, Message | null> {
  const { sessionId, triggerMessageId, toolCalls, signal } = params;
  const { selected, truncated } = truncateToolCalls(toolCalls);

  if (truncated) {
    yield {
      type: 'tool-call-truncated',
      sessionId,
      timestamp: new Date(),
      requestedCount: toolCalls.length,
      executedToolCallId: selected!.id,
    };
  }

  if (!selected) {
    return null;
  }

  const toolInput = parseToolArguments(selected.arguments);
  const inputTrunc = truncatePayload(toolInput);
  if (inputTrunc.truncated) {
    yield {
      type: 'tool-payload-truncated',
      sessionId,
      timestamp: new Date(),
      field: 'toolInput',
      originalLength: inputTrunc.originalLength,
      maxLength: TOOL_RUNTIME_DEFAULTS.maxPayloadChars,
    };
  }

  const startedAt = new Date();
  const { result, status } = await executeToolWithTimeout(
    deps.toolExecutor,
    selected.name,
    toolInput,
    { sessionId, triggerMessageId, signal },
  );
  const completedAt = new Date();

  const outputTrunc = truncatePayload(result.output);
  if (outputTrunc.truncated) {
    yield {
      type: 'tool-payload-truncated',
      sessionId,
      timestamp: new Date(),
      field: 'toolOutput',
      originalLength: outputTrunc.originalLength,
      maxLength: TOOL_RUNTIME_DEFAULTS.maxPayloadChars,
    };
  }

  const payloadTruncated = inputTrunc.truncated || outputTrunc.truncated;

  await deps.toolExecutionSnapshotStore.appendSnapshot(sessionId, {
    sessionId,
    triggerMessageId,
    toolName: selected.name,
    toolInput: inputTrunc.value,
    toolOutput: outputTrunc.value,
    startedAt,
    completedAt,
    status,
    payloadTruncated: payloadTruncated || undefined,
  });

  const toolContent = result.success
    ? JSON.stringify(result.output)
    : JSON.stringify(result.error ?? { message: 'Tool failed' });

  const toolMessage = await deps.store.appendMessage(sessionId, {
    role: 'tool',
    content: toolContent,
    toolCallId: selected.id,
    toolName: selected.name,
    completionState: 'completed',
  });

  yield {
    type: 'tool-result',
    sessionId,
    timestamp: new Date(),
    toolCallId: selected.id,
    toolName: selected.name,
    messageId: toolMessage.id,
    success: result.success,
  };

  return toolMessage;
}
