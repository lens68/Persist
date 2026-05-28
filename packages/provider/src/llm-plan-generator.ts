import type {
  ChatProvider,
  ExecutionPlan,
  PlanGenerationInput,
  PlanGenerator,
  PlanStep,
} from '@persist/shared';
import { ExecutionPlanSchema } from '@persist/shared';

const SYSTEM_PROMPT = `You output ONLY valid JSON for an ExecutionPlan:
{"goal":"string","steps":[{"id":"unique","type":"tool"|"response","description":"string","toolName?":"query_sales","input?":{"metric":"revenue|units|orders","period":"last_month|last_quarter|ytd"}}]}
Use at most one query_sales tool step when data is needed. Always end with a response step.`;

/**
 * LLM plan via ChatProvider.chat() without tools — never executeChat.
 */
export class LlmPlanGenerator implements PlanGenerator {
  readonly id = 'llm-plan';

  constructor(
    private readonly provider: ChatProvider,
    private readonly options?: { model?: string },
  ) {}

  async generatePlan(input: PlanGenerationInput): Promise<ExecutionPlan> {
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...input.resolvedMessages,
      {
        role: 'user' as const,
        content: 'Produce the ExecutionPlan JSON for the conversation above.',
      },
    ];

    let content = '';
    for await (const chunk of this.provider.chat({
      sessionId: input.sessionId,
      messages,
      model: this.options?.model,
    })) {
      if (chunk.type === 'text-delta') content += chunk.delta;
      if (chunk.type === 'message-end') content = chunk.content;
    }

    const parsed = parsePlanJson(content.trim());
    return ExecutionPlanSchema.parse(parsed);
  }
}

function parsePlanJson(raw: string): ExecutionPlan {
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error('No JSON object in plan response');
  }
  const slice = raw.slice(jsonStart, jsonEnd + 1);
  const data = JSON.parse(slice) as { goal?: string; steps?: PlanStep[] };
  if (!data.goal || !Array.isArray(data.steps)) {
    throw new Error('Invalid plan shape');
  }
  return { goal: data.goal, steps: data.steps };
}
