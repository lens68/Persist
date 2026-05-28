import { describe, expect, it } from 'vitest';
import {
  CreatePlanSnapshotInputSchema,
  ExecutionPlanSchema,
  PLAN_RUNTIME_DEFAULTS,
  PlanSnapshotSchema,
  PlanStepExecutionSchema,
  PlanStepSchema,
  RuntimeChunkSchema,
  SessionReplaySchema,
  isObservabilityChunk,
} from './index.js';

describe('plan contracts (v0.4)', () => {
  it('validates ExecutionPlan and PlanStep (CFG-PLAN)', () => {
    const plan = ExecutionPlanSchema.parse({
      goal: 'Answer sales question',
      steps: [
        {
          id: 'step_tool_1',
          type: 'tool',
          description: 'Query revenue',
          toolName: 'query_sales',
          input: { metric: 'revenue', period: 'last_month' },
        },
        {
          id: 'step_response_1',
          type: 'response',
          description: 'Summarize for user',
        },
      ],
    });
    expect(plan.steps).toHaveLength(2);
    expect(PlanStepSchema.parse(plan.steps[0]).type).toBe('tool');
  });

  it('validates PlanSnapshot with executionTrace', () => {
    const sessionId = crypto.randomUUID();
    const snap = PlanSnapshotSchema.parse({
      id: crypto.randomUUID(),
      sessionId,
      triggerMessageId: crypto.randomUUID(),
      plan: {
        goal: 'g',
        steps: [{ id: 's1', type: 'response', description: 'r' }],
      },
      status: 'valid',
      executionTrace: [{ stepId: 's1', status: 'pending' }],
      createdAt: new Date(),
    });
    expect(snap.executionTrace[0]?.status).toBe('pending');
  });

  it('validates invalid PlanSnapshot (plan-null)', () => {
    const snap = PlanSnapshotSchema.parse({
      id: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      triggerMessageId: crypto.randomUUID(),
      plan: null,
      status: 'invalid',
      executionTrace: [],
      invalidReason: 'unknown tool',
      createdAt: new Date(),
    });
    expect(snap.plan).toBeNull();
  });

  it('CFG-PLAN-01: planningEnabled is true', () => {
    expect(PLAN_RUNTIME_DEFAULTS.planningEnabled).toBe(true);
    expect(PLAN_RUNTIME_DEFAULTS.maxExecutableToolSteps).toBe(1);
  });

  it('validates plan observability RuntimeChunks', () => {
    const sessionId = crypto.randomUUID();
    const ts = new Date();
    const planSnapshotId = crypto.randomUUID();
    const chunks = [
      {
        type: 'plan-generated',
        sessionId,
        timestamp: ts,
        planSnapshotId,
        plan: {
          goal: 'g',
          steps: [{ id: 's1', type: 'response', description: 'r' }],
        },
      },
      {
        type: 'plan-invalid',
        sessionId,
        timestamp: ts,
        planSnapshotId,
        reason: 'validation failed',
      },
      {
        type: 'plan-step-start',
        sessionId,
        timestamp: ts,
        planSnapshotId,
        stepId: 's1',
        stepType: 'tool',
      },
      {
        type: 'plan-step-end',
        sessionId,
        timestamp: ts,
        planSnapshotId,
        stepId: 's1',
        stepType: 'tool',
        status: 'completed',
      },
      {
        type: 'plan-step-truncated',
        sessionId,
        timestamp: ts,
        planSnapshotId,
        stepId: 's2',
        reason: 'maxExecutableToolSteps',
      },
    ];
    for (const c of chunks) {
      expect(RuntimeChunkSchema.parse(c)).toBeDefined();
      expect(isObservabilityChunk(RuntimeChunkSchema.parse(c))).toBe(true);
    }
  });

  it('validates SessionReplay with planSnapshots', () => {
    const sessionId = crypto.randomUUID();
    const replay = SessionReplaySchema.parse({
      session: {
        id: sessionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      messages: [],
      memories: [],
      injectionSnapshots: [],
      toolExecutionSnapshots: [],
      planSnapshots: [
        {
          id: crypto.randomUUID(),
          sessionId,
          triggerMessageId: crypto.randomUUID(),
          plan: null,
          status: 'invalid',
          executionTrace: [],
          createdAt: new Date(),
        },
      ],
      reconstructedAt: new Date(),
    });
    expect(replay.planSnapshots).toHaveLength(1);
  });

  it('validates PlanStepExecution statuses', () => {
    for (const status of ['pending', 'completed', 'truncated', 'skipped'] as const) {
      expect(PlanStepExecutionSchema.parse({ stepId: 's1', status }).status).toBe(status);
    }
  });

  it('validates CreatePlanSnapshotInput', () => {
    const input = CreatePlanSnapshotInputSchema.parse({
      sessionId: crypto.randomUUID(),
      triggerMessageId: crypto.randomUUID(),
      plan: { goal: 'g', steps: [{ id: 's1', type: 'response', description: 'r' }] },
      status: 'valid',
      executionTrace: [{ stepId: 's1', status: 'pending' }],
    });
    expect(input.status).toBe('valid');
  });
});
