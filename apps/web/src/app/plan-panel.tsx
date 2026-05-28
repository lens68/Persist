'use client';

export interface PlanStepView {
  id: string;
  type: 'tool' | 'response';
  description: string;
  toolName?: string;
  input?: unknown;
}

export interface PlanSnapshotView {
  id: string;
  status: 'valid' | 'invalid';
  plan: { goal: string; steps: PlanStepView[] } | null;
  executionTrace: Array<{ stepId: string; status: string }>;
  invalidReason?: string;
  createdAt: string;
}

export interface ToolSnapshotView {
  toolName: string;
  planId?: string | null;
  planStepId?: string | null;
  status: string;
  toolOutput?: unknown;
}

export interface ReplayView {
  messages: Array<{ role: string; content: string }>;
  planSnapshots: PlanSnapshotView[];
  toolExecutionSnapshots: ToolSnapshotView[];
}

interface PlanPanelProps {
  replay: ReplayView | null;
  loading?: boolean;
}

const TRACE_COLOR: Record<string, string> = {
  completed: '#2e7d32',
  truncated: '#ed6c02',
  pending: '#757575',
  skipped: '#9e9e9e',
};

/** Read-only Planning audit panel (v0.4 — PlanSnapshot + executionTrace). */
export function PlanPanel({ replay, loading }: PlanPanelProps) {
  const latest = replay?.planSnapshots?.at(-1) ?? null;
  const tools = replay?.toolExecutionSnapshots ?? [];
  const timeline = replay?.messages?.map((m) => m.role).join(' → ') ?? '';

  return (
    <aside
      style={{
        border: '1px solid #c5cae9',
        borderRadius: 8,
        padding: 16,
        background: '#f3f4ff',
      }}
    >
      <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Planning Runtime (v0.4)</h2>
      <p style={{ fontSize: 12, color: '#555', margin: '0 0 12px' }}>
        只读 · ExecutionPlan 与 executionTrace（非聊天气泡；工具由 Plan 选择，非 Provider FC）
      </p>
      {loading && <p style={{ color: '#999', fontSize: 13 }}>加载 Replay…</p>}
      {!loading && !latest && (
        <p style={{ color: '#999', fontSize: 13 }}>发送消息后显示本回合 Plan</p>
      )}
      {timeline && (
        <p style={{ fontSize: 12, margin: '0 0 10px' }}>
          <strong>消息时间线：</strong>
          <code style={{ fontSize: 11 }}>{timeline}</code>
          <span style={{ color: '#666' }}> （v0.4 无 tool 前 assistant）</span>
        </p>
      )}
      {latest && (
        <div
          style={{
            padding: 10,
            borderRadius: 6,
            background: '#fff',
            border: '1px solid #c5cae9',
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
            PlanSnapshot · {latest.status}
            {latest.invalidReason ? ` · ${latest.invalidReason}` : ''}
          </div>
          {latest.plan && (
            <>
              <p style={{ fontSize: 12, margin: '0 0 8px' }}>{latest.plan.goal}</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {latest.plan.steps.map((step) => {
                  const trace = latest.executionTrace.find((t) => t.stepId === step.id);
                  const status = trace?.status ?? 'pending';
                  return (
                    <li key={step.id} style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: TRACE_COLOR[status] ?? '#333' }}>
                        [{status}]
                      </span>{' '}
                      <code>{step.id}</code> · {step.type}
                      {step.type === 'tool' && step.toolName && (
                        <span>
                          {' '}
                          · <code>{step.toolName}</code>
                          {step.input != null && (
                            <span style={{ fontSize: 11, color: '#666' }}>
                              {' '}
                              {JSON.stringify(step.input)}
                            </span>
                          )}
                        </span>
                      )}
                      {status === 'truncated' && (
                        <div style={{ fontSize: 11, color: '#ed6c02', marginTop: 2 }}>
                          ADR-PLAN-03：本回合仅执行 1 个 tool，此 step 未调用
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
      {tools.length > 0 && (
        <div style={{ fontSize: 12 }}>
          <strong>已执行 Tool（{tools.length}）</strong>
          {tools.map((t, i) => (
            <div
              key={i}
              style={{
                marginTop: 6,
                padding: 8,
                background: '#fff',
                borderRadius: 4,
                border: '1px solid #e0e0e0',
              }}
            >
              <code>{t.toolName}</code> · {t.status}
              {t.planStepId && <span style={{ color: '#666' }}> · planStep={t.planStepId}</span>}
              {t.toolOutput != null && (
                <pre
                  style={{
                    fontSize: 10,
                    margin: '6px 0 0',
                    overflow: 'auto',
                    maxHeight: 80,
                  }}
                >
                  {JSON.stringify(t.toolOutput, null, 0)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
