import type {
  Message,
  RuntimeChunk,
  SessionStore,
  ToolExecutionContext,
  ToolExecutionSnapshotStore,
  ToolExecutor,
  ToolExecutionStatus,
} from '@persist/shared';
import { TOOL_RUNTIME_DEFAULTS } from '@persist/shared';
import { truncatePayload } from '@persist/tool';

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
      executor
        .call(toolName, input, context)
        .then((result) => ({ kind: 'result' as const, result })),
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

/** Execute a single planned tool step (ADR-PLAN-03/04). No FC truncation chunks. */
export async function* executePlannedToolStep(
  deps: {
    store: SessionStore;
    toolExecutor: ToolExecutor;
    toolExecutionSnapshotStore: ToolExecutionSnapshotStore;
  },
  params: {
    sessionId: string;
    triggerMessageId: string;
    planId: string;
    planStepId: string;
    toolName: string;
    input: unknown;
    signal?: AbortSignal;
  },
): AsyncGenerator<RuntimeChunk, Message> {
  const { sessionId, triggerMessageId, planId, planStepId, toolName, input, signal } = params;
  const toolCallId = planStepId;

  yield {
    type: 'tool-call-start',
    sessionId,
    timestamp: new Date(),
    toolCallId,
    toolName,
    arguments: JSON.stringify(input ?? {}),
  };

  const inputTrunc = truncatePayload(input);
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
    toolName,
    inputTrunc.value,
    { sessionId, triggerMessageId, signal },
  );
  const completedAt = new Date();

  const snapshotOutput = result.success
    ? result.output
    : (result.error ?? { message: 'Tool failed' });
  const outputTrunc = truncatePayload(snapshotOutput);
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
    planId,
    planStepId,
    toolName,
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
    toolCallId,
    toolName,
    completionState: 'completed',
  });

  yield {
    type: 'tool-call-end',
    sessionId,
    timestamp: new Date(),
    toolCallId,
    toolName,
    arguments: JSON.stringify(inputTrunc.value ?? {}),
  };

  yield {
    type: 'tool-result',
    sessionId,
    timestamp: new Date(),
    toolCallId,
    toolName,
    messageId: toolMessage.id,
    success: result.success,
  };

  return toolMessage;
}
