import type {
  MemoryGenerator,
  MemoryStore,
  RuntimeChunk,
  SessionStore,
} from '@persist/shared';
import {
  createSummaryMemoryEntryInput,
  planMemoryGeneration,
  resolveActiveSummary,
} from '@persist/memory';

export async function* runMemoryGenerationPipeline(deps: {
  sessionId: string;
  store: SessionStore;
  memoryStore: MemoryStore;
  memoryGenerator: MemoryGenerator;
}): AsyncIterable<RuntimeChunk> {
  const { sessionId, store, memoryStore, memoryGenerator } = deps;

  const swm = await store.getSessionWithMessages(sessionId);
  if (!swm) return;

  const memories = await memoryStore.listMemories(sessionId);
  const activeSummary = resolveActiveSummary(memories);
  const plan = planMemoryGeneration({
    sessionId,
    messages: swm.messages,
    activeSummary,
  });

  if (!plan.shouldGenerate || !plan.input) {
    return;
  }

  const generated = await memoryGenerator.generateSummary(plan.input);
  const entryInput = createSummaryMemoryEntryInput(sessionId, generated);
  const persisted = await memoryStore.replaceActiveSummary(
    sessionId,
    entryInput,
    activeSummary?.id ?? null,
  );

  yield {
    type: 'memory-generated',
    sessionId,
    timestamp: new Date(),
    memory: persisted,
  };
}
