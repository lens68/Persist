import { describe, expect, it } from 'vitest';
import {
  toOpenAiApiMessages,
  mergeToolCallDelta,
  mergeToolCallMessage,
} from './openai-messages.js';

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

describe('mergeToolCallMessage', () => {
  it('parses complete message.tool_calls (vendor final chunk)', () => {
    const acc = new Map<number, { id: string; name: string; arguments: string }>();
    mergeToolCallMessage(acc, [
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'query_sales',
          arguments: '{"metric":"revenue","period":"last_month"}',
        },
      },
    ]);
    expect(acc.get(0)).toEqual({
      id: 'call_1',
      name: 'query_sales',
      arguments: '{"metric":"revenue","period":"last_month"}',
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
