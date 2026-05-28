import { TOOL_RUNTIME_DEFAULTS } from '@persist/shared';

export interface TruncatePayloadResult {
  value: unknown;
  truncated: boolean;
  originalLength: number;
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** CFG-TOOL-06 / IC-TOOL-09 — truncate tool input/output for persistence. */
export function truncatePayload(
  value: unknown,
  maxChars: number = TOOL_RUNTIME_DEFAULTS.maxPayloadChars,
): TruncatePayloadResult {
  const serialized = serialize(value);
  if (serialized.length <= maxChars) {
    return { value, truncated: false, originalLength: serialized.length };
  }
  const prefix = serialized.slice(0, maxChars);
  let parsed: unknown = prefix;
  if (typeof value !== 'string') {
    try {
      parsed = JSON.parse(prefix);
    } catch {
      parsed = prefix;
    }
  }
  return { value: parsed, truncated: true, originalLength: serialized.length };
}
