import { z } from 'zod';

export const PlanStepTypeSchema = z.enum(['tool', 'response']);

export type PlanStepType = z.infer<typeof PlanStepTypeSchema>;

export const PlanStepSchema = z.object({
  id: z.string().min(1),
  type: PlanStepTypeSchema,
  description: z.string(),
  toolName: z.string().min(1).optional(),
  input: z.unknown().optional(),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

export const ExecutionPlanSchema = z.object({
  goal: z.string(),
  steps: z.array(PlanStepSchema).min(1),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export const PlanStepExecutionStatusSchema = z.enum([
  'pending',
  'completed',
  'truncated',
  'skipped',
]);

export type PlanStepExecutionStatus = z.infer<typeof PlanStepExecutionStatusSchema>;

export const PlanStepExecutionSchema = z.object({
  stepId: z.string().min(1),
  status: PlanStepExecutionStatusSchema,
});

export type PlanStepExecution = z.infer<typeof PlanStepExecutionSchema>;

export const PlanSnapshotStatusSchema = z.enum(['valid', 'invalid']);

export type PlanSnapshotStatus = z.infer<typeof PlanSnapshotStatusSchema>;

export const PlanSnapshotSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  triggerMessageId: z.string().uuid(),
  plan: ExecutionPlanSchema.nullable(),
  status: PlanSnapshotStatusSchema,
  executionTrace: z.array(PlanStepExecutionSchema),
  invalidReason: z.string().optional(),
  createdAt: z.coerce.date(),
});

export type PlanSnapshot = z.infer<typeof PlanSnapshotSchema>;

export const CreatePlanSnapshotInputSchema = PlanSnapshotSchema.omit({
  id: true,
  createdAt: true,
}).extend({
  id: z.string().uuid().optional(),
});

export type CreatePlanSnapshotInput = z.infer<typeof CreatePlanSnapshotInputSchema>;

/** CFG-PLAN-01: planning always on in v0.4; no false branch / FC fallback. */
export const PLAN_RUNTIME_DEFAULTS = {
  planningEnabled: true,
  maxExecutableToolSteps: 1,
} as const;
