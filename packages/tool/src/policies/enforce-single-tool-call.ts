import { TOOL_RUNTIME_DEFAULTS } from '@persist/shared';

/** CFG-TOOL-01 — enforce single tool execution per turn. */
export function enforceSingleToolCall(alreadyExecuted: boolean): boolean {
  return !alreadyExecuted && TOOL_RUNTIME_DEFAULTS.maxToolCallsPerTurn >= 1;
}

export function assertMaxRegisteredTools(count: number): void {
  if (count > TOOL_RUNTIME_DEFAULTS.maxRegisteredTools) {
    throw new Error(
      `Tool registry exceeds max ${TOOL_RUNTIME_DEFAULTS.maxRegisteredTools} (CFG-TOOL-03)`,
    );
  }
}
