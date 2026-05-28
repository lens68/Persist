import type { ExecutionPlan, PlanGenerationInput, PlanGenerator } from '@persist/shared';

function lastUserContent(input: PlanGenerationInput): string {
  const users = input.resolvedMessages.filter((m) => m.role === 'user');
  return users.at(-1)?.content ?? '';
}

/**
 * Deterministic plan generator for Sales demo (CI default, no API key).
 */
export class RuleBasedPlanGenerator implements PlanGenerator {
  readonly id = 'rule-based-sales';

  async generatePlan(input: PlanGenerationInput): Promise<ExecutionPlan> {
    const text = lastUserContent(input).toLowerCase();

    const isCompare =
      text.includes('对比') ||
      (text.includes('上月') && text.includes('季度')) ||
      text.includes('last_quarter');

    if (isCompare) {
      return {
        goal: 'Compare sales across periods',
        steps: [
          {
            id: 'step_tool_month',
            type: 'tool',
            description: 'Query last month revenue',
            toolName: 'query_sales',
            input: { metric: 'revenue', period: 'last_month' },
          },
          {
            id: 'step_tool_quarter',
            type: 'tool',
            description: 'Query last quarter revenue',
            toolName: 'query_sales',
            input: { metric: 'revenue', period: 'last_quarter' },
          },
          {
            id: 'step_response',
            type: 'response',
            description: 'Summarize comparison for user',
          },
        ],
      };
    }

    const wantsSales =
      /销量|销售|revenue|top|最高|排名第一|query|widget|last_month|last_quarter|ytd|units|orders/.test(
        text,
      );

    if (wantsSales) {
      let metric: 'revenue' | 'units' | 'orders' = 'revenue';
      if (text.includes('revenue')) metric = 'revenue';
      else if (text.includes('units') || text.includes('销量')) metric = 'units';
      else if (text.includes('orders')) metric = 'orders';

      let period: 'last_month' | 'last_quarter' | 'ytd' = 'last_month';
      if (text.includes('last_quarter') || text.includes('季度')) period = 'last_quarter';
      if (text.includes('ytd') || text.includes('年初')) period = 'ytd';

      return {
        goal: 'Find top sales product',
        steps: [
          {
            id: 'step_tool_sales',
            type: 'tool',
            description: `Query ${metric} for ${period}`,
            toolName: 'query_sales',
            input: { metric, period },
          },
          {
            id: 'step_response',
            type: 'response',
            description: 'Present top product to user',
          },
        ],
      };
    }

    return {
      goal: 'Respond without tools',
      steps: [
        {
          id: 'step_response',
          type: 'response',
          description: 'Direct assistant response',
        },
      ],
    };
  }
}
