import type { FastifyInstance } from 'fastify';
import type {
  ChatProvider,
  InjectionSnapshotStore,
  MemoryGenerator,
  MemoryStore,
  PlanGenerator,
  PlanSnapshotStore,
  SessionStore,
  ToolDefinition,
  ToolExecutionSnapshotStore,
  ToolExecutor,
} from '@persist/shared';
import { CreateSessionInputSchema } from '@persist/shared';
import { executeChat } from '@persist/runtime';
import { assertMaxRegisteredTools } from '@persist/tool';
import { writeRuntimeChunkSse } from './sse.js';

export interface ApiDeps {
  store: SessionStore;
  memoryStore: MemoryStore;
  injectionSnapshotStore: InjectionSnapshotStore;
  toolExecutionSnapshotStore: ToolExecutionSnapshotStore;
  planSnapshotStore: PlanSnapshotStore;
  planGenerator: PlanGenerator;
  provider: ChatProvider;
  memoryGenerator: MemoryGenerator;
  toolExecutor: ToolExecutor;
  toolDefinitions: ToolDefinition[];
}

export async function registerRoutes(app: FastifyInstance, deps: ApiDeps) {
  const {
    store,
    memoryStore,
    injectionSnapshotStore,
    toolExecutionSnapshotStore,
    planSnapshotStore,
    planGenerator,
    provider,
    memoryGenerator,
    toolExecutor,
    toolDefinitions,
  } = deps;

  assertMaxRegisteredTools(toolDefinitions.length);

  app.post('/api/sessions', async (request, reply) => {
    const body = CreateSessionInputSchema.safeParse(request.body ?? {});
    const input = body.success ? body.data : {};
    const session = await store.createSession(input);
    return reply.status(201).send(session);
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const swm = await store.getSessionWithMessages(request.params.id);
    if (!swm) return reply.status(404).send({ error: 'Session not found' });
    return swm;
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id/replay', async (request, reply) => {
    const replay = await store.getReplay(request.params.id);
    if (!replay) return reply.status(404).send({ error: 'Session not found' });
    return replay;
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id/memories', async (request, reply) => {
    const session = await store.getSession(request.params.id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    const memories = await memoryStore.listMemories(request.params.id);
    return memories;
  });

  app.post<{ Params: { id: string } }>('/api/sessions/:id/messages', async (request, reply) => {
    const sessionId = request.params.id;
    const body = request.body as { content?: string; model?: string };
    const content = body?.content?.trim();
    if (!content) {
      return reply.status(400).send({ error: 'content is required' });
    }

    const stream = executeChat(
      {
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
      },
      { sessionId, userContent: content, model: body?.model },
    );

    reply.hijack();
    await writeRuntimeChunkSse(reply.raw, stream);
  });
}
