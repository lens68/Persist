import type {
  ChatProvider,
  InjectionSnapshotStore,
  MemoryGenerator,
  MemoryStore,
  RuntimeChunk,
  SessionStore,
  ToolDefinition,
  ToolExecutionSnapshotStore,
  ToolExecutor,
} from '@persist/shared';
import { assertMaxRegisteredTools } from '@persist/tool';
import type { ChatExecutionInput } from './chat-execution-types.js';
import { runMemoryGenerationPipeline } from './memory-generation-pipeline.js';
import { runProviderChatPhase } from './provider-chat-phase.js';
import { executeToolCallPhase, runMemoryInjectionPhase } from './tool-execution-phase.js';

export type { ChatExecutionInput } from './chat-execution-types.js';

export interface ChatExecutionDeps {
  provider: ChatProvider;
  store: SessionStore;
  memoryStore: MemoryStore;
  injectionSnapshotStore: InjectionSnapshotStore;
  memoryGenerator: MemoryGenerator;
  toolExecutor: ToolExecutor;
  toolDefinitions: ToolDefinition[];
  toolExecutionSnapshotStore: ToolExecutionSnapshotStore;
}

/**
 * Persistence-aware chat execution with memory + optional single tool call (§9).
 */
export async function* executeChat(
  deps: ChatExecutionDeps,
  input: ChatExecutionInput,
): AsyncIterable<RuntimeChunk> {
  const {
    provider,
    store,
    memoryStore,
    injectionSnapshotStore,
    memoryGenerator,
    toolExecutor,
    toolDefinitions,
    toolExecutionSnapshotStore,
  } = deps;
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

  assertMaxRegisteredTools(toolDefinitions.length);

  const injectionGen = runMemoryInjectionPhase(
    { store, memoryStore, injectionSnapshotStore },
    { sessionId, triggerMessageId },
  );
  let injectionResult = await injectionGen.next();
  while (!injectionResult.done) {
    yield injectionResult.value;
    injectionResult = await injectionGen.next();
  }
  const firstSnapshot = injectionResult.value;

  const provider1Gen = runProviderChatPhase(provider, store, {
    sessionId,
    messages: firstSnapshot.resolvedMessages,
    model,
    signal,
    tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
  });
  let provider1Result = await provider1Gen.next();
  while (!provider1Result.done) {
    yield provider1Result.value;
    provider1Result = await provider1Gen.next();
  }
  const phase1 = provider1Result.value;

  if (!phase1.executionCompleted) {
    return;
  }

  const hasToolCall = phase1.toolCalls.length > 0;

  if (!hasToolCall) {
    for await (const genChunk of runMemoryGenerationPipeline({
      sessionId,
      store,
      memoryStore,
      memoryGenerator,
    })) {
      yield genChunk;
    }
    return;
  }

  const toolGen = executeToolCallPhase(
    { store, toolExecutor, toolExecutionSnapshotStore },
    { sessionId, triggerMessageId, toolCalls: phase1.toolCalls, signal },
  );
  let toolResult = await toolGen.next();
  while (!toolResult.done) {
    yield toolResult.value;
    toolResult = await toolGen.next();
  }

  const injection2Gen = runMemoryInjectionPhase(
    { store, memoryStore, injectionSnapshotStore },
    { sessionId, triggerMessageId },
  );
  let injection2Result = await injection2Gen.next();
  while (!injection2Result.done) {
    yield injection2Result.value;
    injection2Result = await injection2Gen.next();
  }
  const secondSnapshot = injection2Result.value;

  const provider2Gen = runProviderChatPhase(provider, store, {
    sessionId,
    messages: secondSnapshot.resolvedMessages,
    model,
    signal,
  });
  let provider2Result = await provider2Gen.next();
  while (!provider2Result.done) {
    yield provider2Result.value;
    provider2Result = await provider2Gen.next();
  }
  const phase2 = provider2Result.value;

  if (phase2.executionCompleted) {
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
