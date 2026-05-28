import type {
  ChatProvider,
  InjectionSnapshotStore,
  MemoryGenerator,
  MemoryStore,
  PlanGenerator,
  PlanSnapshotStore,
  RuntimeChunk,
  SessionStore,
  ToolDefinition,
  ToolExecutionSnapshotStore,
  ToolExecutor,
} from '@persist/shared';
import { toChatMessages } from '@persist/shared';
import { assertMaxRegisteredTools } from '@persist/tool';
import type { ChatExecutionInput } from './chat-execution-types.js';
import { runMemoryGenerationPipeline } from './memory-generation-pipeline.js';
import { finalizePlanTraceAfterSynthesis, runPlanExecutionPhase } from './plan-execution-phase.js';
import { runPlanGenerationPhase } from './plan-generation-phase.js';
import { runProviderChatPhase } from './provider-chat-phase.js';
import { runMemoryInjectionPhase } from './memory-injection-phase.js';

export type { ChatExecutionInput } from './chat-execution-types.js';

export interface ChatExecutionDeps {
  provider: ChatProvider;
  planGenerator: PlanGenerator;
  planSnapshotStore: PlanSnapshotStore;
  store: SessionStore;
  memoryStore: MemoryStore;
  injectionSnapshotStore: InjectionSnapshotStore;
  memoryGenerator: MemoryGenerator;
  toolExecutor: ToolExecutor;
  toolDefinitions: ToolDefinition[];
  toolExecutionSnapshotStore: ToolExecutionSnapshotStore;
}

/**
 * v0.4 Planning path: injection once → plan → at most one tool → synthesis (no tools).
 */
export async function* executeChat(
  deps: ChatExecutionDeps,
  input: ChatExecutionInput,
): AsyncIterable<RuntimeChunk> {
  const {
    provider,
    planGenerator,
    planSnapshotStore,
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
  const injectionSnapshot = injectionResult.value;

  const planGen = runPlanGenerationPhase(
    { planGenerator, planSnapshotStore, toolDefinitions },
    {
      sessionId,
      triggerMessageId,
      resolvedMessages: injectionSnapshot.resolvedMessages,
    },
  );
  let planGenResult = await planGen.next();
  while (!planGenResult.done) {
    yield planGenResult.value;
    planGenResult = await planGen.next();
  }
  const { planSnapshot, effectivePlan } = planGenResult.value;

  const planExecGen = runPlanExecutionPhase(
    {
      store,
      toolExecutor,
      toolExecutionSnapshotStore,
      planSnapshotStore,
    },
    {
      sessionId,
      triggerMessageId,
      planSnapshot,
      plan: effectivePlan,
      signal,
    },
  );
  let planExecResult = await planExecGen.next();
  while (!planExecResult.done) {
    yield planExecResult.value;
    planExecResult = await planExecGen.next();
  }
  const { executedToolStepId, truncatedToolStepIds } = planExecResult.value;

  const sessionForSynthesis = await store.getSessionWithMessages(sessionId);
  if (!sessionForSynthesis) {
    yield {
      type: 'error',
      sessionId,
      timestamp: new Date(),
      code: 'session_not_found',
      message: `Session ${sessionId} not found for synthesis`,
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

  const synthesisMessages = toChatMessages(sessionForSynthesis.messages);

  const synthesisGen = runProviderChatPhase(provider, store, {
    sessionId,
    messages: synthesisMessages,
    model,
    signal,
  });
  let synthesisResult = await synthesisGen.next();
  while (!synthesisResult.done) {
    yield synthesisResult.value;
    synthesisResult = await synthesisGen.next();
  }
  const synthesisPhase = synthesisResult.value;

  await finalizePlanTraceAfterSynthesis(planSnapshotStore, {
    sessionId,
    planSnapshot,
    plan: effectivePlan,
    executedToolStepId,
    truncatedToolStepIds,
    synthesisCompleted: synthesisPhase.executionCompleted,
    synthesisFailed: !synthesisPhase.executionCompleted,
  });

  for (const step of effectivePlan.steps) {
    if (step.type === 'response') {
      yield {
        type: 'plan-step-end',
        sessionId,
        timestamp: new Date(),
        planSnapshotId: planSnapshot.id,
        stepId: step.id,
        stepType: 'response',
        status: synthesisPhase.executionCompleted ? 'completed' : 'skipped',
      };
    }
  }

  if (synthesisPhase.executionCompleted) {
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
