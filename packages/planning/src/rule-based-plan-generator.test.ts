import { describe, expect, it } from 'vitest';
import { RuleBasedPlanGenerator } from './rule-based-plan-generator.js';

describe('RuleBasedPlanGenerator', () => {
  const gen = new RuleBasedPlanGenerator();

  it('maps top sales query to single tool + response', async () => {
    const plan = await gen.generatePlan({
      sessionId: crypto.randomUUID(),
      triggerMessageId: crypto.randomUUID(),
      resolvedMessages: [
        {
          role: 'user',
          content: '请查询上个月 revenue 销量排名第一的产品',
        },
      ],
    });
    expect(plan.steps.filter((s) => s.type === 'tool')).toHaveLength(1);
    expect(plan.steps[0]?.toolName).toBe('query_sales');
    expect(plan.steps[0]?.input).toEqual({ metric: 'revenue', period: 'last_month' });
  });

  it('maps compare intent to two tool steps', async () => {
    const plan = await gen.generatePlan({
      sessionId: crypto.randomUUID(),
      triggerMessageId: crypto.randomUUID(),
      resolvedMessages: [{ role: 'user', content: '对比上月和季度的 revenue' }],
    });
    const tools = plan.steps.filter((s) => s.type === 'tool');
    expect(tools).toHaveLength(2);
    expect(tools[0]?.input).toMatchObject({ period: 'last_month' });
    expect(tools[1]?.input).toMatchObject({ period: 'last_quarter' });
  });

  it('maps chitchat to response-only', async () => {
    const plan = await gen.generatePlan({
      sessionId: crypto.randomUUID(),
      triggerMessageId: crypto.randomUUID(),
      resolvedMessages: [{ role: 'user', content: '你好' }],
    });
    expect(plan.steps.every((s) => s.type === 'response')).toBe(true);
  });
});
