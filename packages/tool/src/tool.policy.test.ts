import { describe, expect, it } from 'vitest';
import {
  assertMaxRegisteredTools,
  buildQuerySalesSql,
  truncatePayload,
  truncateToolCalls,
  validateQuerySalesInput,
} from './index.js';
import { TOOL_RUNTIME_DEFAULTS } from '@persist/shared';

describe('truncateToolCalls (IC-TOOL-06)', () => {
  it('returns null when empty', () => {
    expect(truncateToolCalls([])).toEqual({ selected: null, truncated: false });
  });

  it('selects first and flags truncation', () => {
    const calls = [
      { id: 'a', name: 'query_sales', arguments: '{}' },
      { id: 'b', name: 'other', arguments: '{}' },
    ];
    const r = truncateToolCalls(calls);
    expect(r.selected?.id).toBe('a');
    expect(r.truncated).toBe(true);
  });
});

describe('assertMaxRegisteredTools (CFG-TOOL-03)', () => {
  it('throws when over limit', () => {
    expect(() => assertMaxRegisteredTools(17)).toThrow(/CFG-TOOL-03/);
  });
});

describe('truncatePayload (CFG-TOOL-06)', () => {
  it('truncates oversized output', () => {
    const big = 'x'.repeat(TOOL_RUNTIME_DEFAULTS.maxPayloadChars + 100);
    const r = truncatePayload(big);
    expect(r.truncated).toBe(true);
    expect(r.originalLength).toBeGreaterThan(TOOL_RUNTIME_DEFAULTS.maxPayloadChars);
  });
});

describe('buildQuerySalesSql (IC-TOOL-07)', () => {
  it('rejects invalid metric', () => {
    expect(() => validateQuerySalesInput({ metric: 'DROP TABLE', period: 'last_month' })).toThrow(
      /Invalid metric/,
    );
  });

  it('builds whitelist SQL', () => {
    const sql = buildQuerySalesSql('revenue', 'last_month');
    expect(sql).toContain('SUM(amount)');
    expect(sql).toContain('sales');
    expect(sql).not.toContain('DROP');
  });
});
