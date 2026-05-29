import type {
  CreateMemoryEntryInput,
  CreateMemoryInjectionSnapshotInput,
  CreateMessageInput,
  CreatePlanSnapshotInput,
  CreateSessionInput,
  CreateToolExecutionSnapshotInput,
  ExecutionPlan,
  InjectionSnapshotStore,
  MemoryEntry,
  MemoryInjectionSnapshot,
  MemoryStore,
  Message,
  PlanGenerator,
  PlanSnapshot,
  PlanSnapshotStore,
  PlanStepExecution,
  Session,
  SessionReplay,
  SessionStore,
  SessionSummary,
  SessionWithMessages,
  ToolExecutionSnapshot,
  ToolExecutionSnapshotStore,
} from '@persist/shared';
import { SESSION_PREVIEW_TEXT_MAX_LENGTH } from '@persist/shared';

interface InMemorySessionRecord {
  id: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, InMemorySessionRecord>();
  private planSnapshots: PlanSnapshot[] = [];
  private toolSnapshots: ToolExecutionSnapshot[] = [];

  setPlanSnapshotsForReplay(snapshots: PlanSnapshot[]) {
    this.planSnapshots = snapshots;
  }

  setToolSnapshotsForReplay(snapshots: ToolExecutionSnapshot[]) {
    this.toolSnapshots = snapshots;
  }

  async createSession(_input: CreateSessionInput): Promise<Session> {
    const id = crypto.randomUUID();
    const now = new Date();
    this.sessions.set(id, { id, messages: [], createdAt: now, updatedAt: now });
    return { id, createdAt: now, updatedAt: now };
  }

  async getSession(id: string): Promise<Session | null> {
    const s = this.sessions.get(id);
    if (!s) return null;
    return { id: s.id, createdAt: s.createdAt, updatedAt: s.updatedAt };
  }

  async getSessionWithMessages(id: string): Promise<SessionWithMessages | null> {
    const s = this.sessions.get(id);
    if (!s) return null;
    return {
      id: s.id,
      messages: [...s.messages],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  async appendMessage(sessionId: string, input: CreateMessageInput): Promise<Message> {
    const s = this.sessions.get(sessionId)!;
    const now = new Date();
    const msg: Message = {
      id: input.id ?? crypto.randomUUID(),
      sessionId,
      role: input.role,
      content: input.content,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      providerMetadata: input.providerMetadata,
      completionState: input.completionState ?? 'completed',
      createdAt: now,
    };
    s.messages.push(msg);
    s.updatedAt = now;
    return msg;
  }

  async updateMessage(
    sessionId: string,
    messageId: string,
    patch: Partial<
      Pick<Message, 'content' | 'providerMetadata' | 'completionState' | 'completedAt'>
    >,
  ): Promise<Message> {
    const s = this.sessions.get(sessionId)!;
    const idx = s.messages.findIndex((m) => m.id === messageId);
    s.messages[idx] = { ...s.messages[idx]!, ...patch };
    s.updatedAt = new Date();
    return s.messages[idx]!;
  }

  async listSessionSummaries(options?: { limit?: number }): Promise<SessionSummary[]> {
    const limit = options?.limit ?? 50;
    return [...this.sessions.values()]
      .filter((s) => s.messages.some((m) => m.role === 'user'))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit)
      .map((s) => {
        const firstUser = s.messages.find((m) => m.role === 'user')!;
        return {
          id: s.id,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
          previewText: firstUser.content.slice(0, SESSION_PREVIEW_TEXT_MAX_LENGTH),
        };
      });
  }

  async getReplay(sessionId: string): Promise<SessionReplay | null> {
    const swm = await this.getSessionWithMessages(sessionId);
    if (!swm) return null;
    const { messages, ...session } = swm;
    return {
      session,
      messages,
      memories: [],
      injectionSnapshots: [],
      toolExecutionSnapshots: this.toolSnapshots.filter((t) => t.sessionId === sessionId),
      planSnapshots: this.planSnapshots.filter((p) => p.sessionId === sessionId),
      reconstructedAt: new Date(),
    };
  }
}

export class InMemoryMemoryStore implements MemoryStore {
  private entries: MemoryEntry[] = [];

  async appendMemory(sessionId: string, input: CreateMemoryEntryInput): Promise<MemoryEntry> {
    if (input.type === 'summary') throw new Error('use replaceActiveSummary');
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      sessionId,
      type: input.type,
      content: input.content,
      createdAt: new Date(),
    };
    this.entries.push(entry);
    return entry;
  }

  async listMemories(sessionId: string): Promise<MemoryEntry[]> {
    return this.entries.filter((e) => e.sessionId === sessionId);
  }

  async getActiveSummary(sessionId: string): Promise<MemoryEntry | null> {
    return this.entries.filter((e) => e.sessionId === sessionId && !e.supersededBy).at(-1) ?? null;
  }

  async supersedeMemory(memoryId: string, supersededBy: string): Promise<MemoryEntry> {
    const e = this.entries.find((x) => x.id === memoryId)!;
    e.supersededBy = supersededBy;
    return e;
  }

  async replaceActiveSummary(
    sessionId: string,
    input: CreateMemoryEntryInput,
    previousMemoryId: string | null,
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      sessionId,
      type: 'summary',
      content: input.content,
      sourceMessageIds: input.sourceMessageIds,
      createdAt: new Date(),
    };
    if (previousMemoryId) {
      const prev = this.entries.find((x) => x.id === previousMemoryId)!;
      prev.supersededBy = entry.id;
    }
    this.entries.push(entry);
    return entry;
  }

  seed(entry: MemoryEntry) {
    this.entries.push(entry);
  }
}

export class InMemoryInjectionSnapshotStore implements InjectionSnapshotStore {
  snapshots: MemoryInjectionSnapshot[] = [];

  async appendInjectionSnapshot(
    sessionId: string,
    input: CreateMemoryInjectionSnapshotInput,
  ): Promise<MemoryInjectionSnapshot> {
    const snap: MemoryInjectionSnapshot = {
      id: crypto.randomUUID(),
      sessionId,
      triggerMessageId: input.triggerMessageId,
      injectedMemoryIds: input.injectedMemoryIds,
      resolvedMessages: input.resolvedMessages,
      strategy: input.strategy,
      createdAt: new Date(),
    };
    this.snapshots.push(snap);
    return snap;
  }

  async listInjectionSnapshots(sessionId: string): Promise<MemoryInjectionSnapshot[]> {
    return this.snapshots.filter((s) => s.sessionId === sessionId);
  }
}

export class InMemoryToolSnapshotStore implements ToolExecutionSnapshotStore {
  snapshots: ToolExecutionSnapshot[] = [];

  async appendSnapshot(
    sessionId: string,
    input: CreateToolExecutionSnapshotInput,
  ): Promise<ToolExecutionSnapshot> {
    const snap: ToolExecutionSnapshot = {
      id: crypto.randomUUID(),
      sessionId,
      triggerMessageId: input.triggerMessageId,
      planId: input.planId,
      planStepId: input.planStepId,
      toolName: input.toolName,
      toolInput: input.toolInput,
      toolOutput: input.toolOutput,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      status: input.status,
      payloadTruncated: input.payloadTruncated,
    };
    this.snapshots.push(snap);
    return snap;
  }

  async listSnapshots(sessionId: string): Promise<ToolExecutionSnapshot[]> {
    return this.snapshots.filter((s) => s.sessionId === sessionId);
  }
}

export class InMemoryPlanSnapshotStore implements PlanSnapshotStore {
  snapshots: PlanSnapshot[] = [];

  async appendSnapshot(sessionId: string, input: CreatePlanSnapshotInput): Promise<PlanSnapshot> {
    const snap: PlanSnapshot = {
      id: input.id ?? crypto.randomUUID(),
      sessionId,
      triggerMessageId: input.triggerMessageId,
      plan: input.plan,
      status: input.status,
      executionTrace: input.executionTrace,
      invalidReason: input.invalidReason,
      createdAt: new Date(),
    };
    this.snapshots.push(snap);
    return snap;
  }

  async updateExecutionTrace(
    sessionId: string,
    snapshotId: string,
    executionTrace: PlanStepExecution[],
  ): Promise<PlanSnapshot> {
    const snap = this.snapshots.find((s) => s.id === snapshotId && s.sessionId === sessionId);
    if (!snap) throw new Error(`Plan snapshot ${snapshotId} not found`);
    snap.executionTrace = executionTrace;
    return snap;
  }

  async listSnapshots(sessionId: string): Promise<PlanSnapshot[]> {
    return this.snapshots.filter((s) => s.sessionId === sessionId);
  }
}

export function createMockPlanGenerator(plan: ExecutionPlan): PlanGenerator {
  return {
    id: 'mock-plan',
    generatePlan: async () => plan,
  };
}
