import type { ChatMessage } from '../types/chat-message.js';
import type { ExecutionPlan } from '../types/plan.js';

/**
 * Input for plan generation (ADR-PLAN-06: single injection snapshot messages).
 * MUST NOT call executeChat.
 */
export interface PlanGenerationInput {
  sessionId: string;
  triggerMessageId: string;
  resolvedMessages: ChatMessage[];
}

/**
 * Planning port — implementations may call ChatProvider (LlmPlanGenerator).
 * MUST NOT call executeChat.
 */
export interface PlanGenerator {
  readonly id: string;
  generatePlan(input: PlanGenerationInput): Promise<ExecutionPlan>;
}
