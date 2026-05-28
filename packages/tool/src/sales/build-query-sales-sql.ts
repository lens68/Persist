/** IC-TOOL-07 — whitelist SQL template; no LLM free-text SQL. */

const ALLOWED_METRICS = ['revenue', 'units', 'orders'] as const;
const ALLOWED_PERIODS = ['last_month', 'last_quarter', 'ytd'] as const;

export type SalesMetric = (typeof ALLOWED_METRICS)[number];
export type SalesPeriod = (typeof ALLOWED_PERIODS)[number];

export interface QuerySalesInput {
  metric: string;
  period: string;
}

export function validateQuerySalesInput(input: unknown): QuerySalesInput {
  if (!input || typeof input !== 'object') {
    throw new Error('query_sales input must be an object');
  }
  const { metric, period } = input as Record<string, unknown>;
  if (typeof metric !== 'string' || !ALLOWED_METRICS.includes(metric as SalesMetric)) {
    throw new Error(`Invalid metric; allowed: ${ALLOWED_METRICS.join(', ')}`);
  }
  if (typeof period !== 'string' || !ALLOWED_PERIODS.includes(period as SalesPeriod)) {
    throw new Error(`Invalid period; allowed: ${ALLOWED_PERIODS.join(', ')}`);
  }
  return { metric, period };
}

/** Returns parameterized SQL for sales fixture (caller binds params). */
export function buildQuerySalesSql(metric: SalesMetric, period: SalesPeriod): string {
  const metricColumn =
    metric === 'revenue' ? 'SUM(amount)' : metric === 'units' ? 'SUM(units)' : 'COUNT(*)';
  const periodFilter =
    period === 'last_month'
      ? "strftime('%Y-%m', sold_at) = strftime('%Y-%m', 'now', '-1 month')"
      : period === 'last_quarter'
        ? "sold_at >= date('now', '-3 months')"
        : "strftime('%Y', sold_at) = strftime('%Y', 'now')";

  return `
    SELECT product_name, ${metricColumn} AS value
    FROM sales
    WHERE ${periodFilter}
    GROUP BY product_name
    ORDER BY value DESC
    LIMIT 1
  `.trim();
}

export const QUERY_SALES_TOOL_DEFINITION = {
  name: 'query_sales',
  description: 'Query the top-selling product by metric and time period from sales data.',
  inputSchema: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        enum: [...ALLOWED_METRICS],
        description: 'Sales metric to rank by',
      },
      period: {
        type: 'string',
        enum: [...ALLOWED_PERIODS],
        description: 'Time period for the query',
      },
    },
    required: ['metric', 'period'],
  },
} as const;
