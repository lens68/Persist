import { describe, expect, it } from 'vitest';
import { toOpenAiApiMessages, mergeToolCallDelta } from './openai-messages.js';

describe('toOpenAiApiMessages', () => {
  it('maps tool messages with tool_call_id', () => {
    const msgs = toOpenAiApiMessages([{ role: 'tool', content: '{}', toolCallId: 'call_1' }]);
    expect(msgs[0]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{}' });
  });

  it('maps assistant with toolCalls for provider #2', () => {
    const msgs = toOpenAiApiMessages([
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', name: 'query_sales', arguments: '{}' }],
      },
    ]);
    expect(msgs[0]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'c1', type: 'function' }],
    });
  });
});

describe('mergeToolCallDelta', () => {
  it('accumulates streaming tool call arguments', () => {
    const acc = new Map<number, { id: string; name: string; arguments: string }>();
    mergeToolCallDelta(acc, [
      { index: 0, id: 'c1', function: { name: 'query_sales', arguments: '{"m' } },
    ]);
    mergeToolCallDelta(acc, [{ index: 0, function: { arguments: 'etric":"revenue"}' } }]);
    expect(acc.get(0)?.arguments).toBe('{"metric":"revenue"}');
  });
});
