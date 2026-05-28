import type {
  ToolExecutionContext,
  ToolExecutor,
  ToolResult,
} from '@persist/shared';
import {
  buildQuerySalesSql,
  validateQuerySalesInput,
  type SalesMetric,
  type SalesPeriod,
} from '@persist/tool';
import { openSalesFixtureReadOnly } from './fixtures/sales-fixture.js';

export interface SqliteInProcessToolExecutorConfig {
  /** e.g. file:./.data/sales-fixture.db or :memory: */
  fixtureDatabaseUrl: string;
}

/**
 * In-process tool executor backed by read-only sales SQLite fixture (FR-TOOL-15/16).
 */
export class SqliteInProcessToolExecutor implements ToolExecutor {
  private readonly fixtureDatabaseUrl: string;

  constructor(config: SqliteInProcessToolExecutorConfig) {
    this.fixtureDatabaseUrl = config.fixtureDatabaseUrl;
  }

  async call(toolName: string, input: unknown, _context: ToolExecutionContext): Promise<ToolResult> {
    if (toolName !== 'query_sales') {
      return {
        success: false,
        output: null,
        error: { code: 'unknown_tool', message: `Unknown tool: ${toolName}` },
      };
    }

    try {
      const { metric, period } = validateQuerySalesInput(input);
      const sql = buildQuerySalesSql(metric as SalesMetric, period as SalesPeriod);
      const db = openSalesFixtureReadOnly(this.fixtureDatabaseUrl);
      try {
        const row = db.prepare(sql).get() as
          | { product_name: string; value: number }
          | undefined;
        if (!row) {
          return { success: true, output: { product: null, metric, period } };
        }
        return {
          success: true,
          output: {
            product: row.product_name,
            value: row.value,
            metric,
            period,
          },
        };
      } finally {
        db.close();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: null,
        error: { code: 'tool_execution_failed', message },
      };
    }
  }
}
