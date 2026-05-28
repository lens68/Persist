import type { ChatMessage } from '@persist/shared';

/** Map runtime ChatMessage to OpenAI-compatible API payload. */
export function toOpenAiApiMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: m.content,
      };
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

export interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** Merge streaming tool_call deltas (OpenAI-compatible). */
export function mergeToolCallDelta(
  accumulated: Map<number, AccumulatedToolCall>,
  toolCalls: Array<Record<string, unknown>>,
): void {
  for (const tc of toolCalls) {
    const index = typeof tc.index === 'number' ? tc.index : 0;
    const existing = accumulated.get(index) ?? { id: '', name: '', arguments: '' };
    if (typeof tc.id === 'string') existing.id = tc.id;
    const fn = tc.function as Record<string, unknown> | undefined;
    if (fn && typeof fn.name === 'string') existing.name = fn.name;
    if (fn && typeof fn.arguments === 'string') existing.arguments += fn.arguments;
    accumulated.set(index, existing);
  }
}
