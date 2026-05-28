import type { ToolCallMetadata } from '@persist/shared';

/** IC-TOOL-06 — keep first tool call only. */
export function truncateToolCalls(toolCalls: ToolCallMetadata[]): {
  selected: ToolCallMetadata | null;
  truncated: boolean;
} {
  if (toolCalls.length === 0) {
    return { selected: null, truncated: false };
  }
  return {
    selected: toolCalls[0]!,
    truncated: toolCalls.length > 1,
  };
}
