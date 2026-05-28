/**
 * Persist v0.4 Planning Runtime demo.
 * Prereq: API on :3001, DASHSCOPE_API_KEY in monorepo .env (synthesis).
 * Usage: node scripts/run-planning-demo.mjs
 */
const API = process.env.API_URL ?? 'http://localhost:3001';

async function drainChat(sessionId, content) {
  const res = await fetch(`${API}/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`chat failed ${res.status}: ${t}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const events = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        events.push(JSON.parse(data));
      } catch {
        /* skip */
      }
    }
  }
  return events;
}

function printPlanObservability(events) {
  const planTypes = [
    'plan-generated',
    'plan-invalid',
    'plan-step-start',
    'plan-step-end',
    'plan-step-truncated',
  ];
  for (const t of planTypes) {
    const hits = events.filter((e) => e.type === t);
    for (const e of hits) {
      if (t === 'plan-generated') {
        console.log(`  [${t}] snapshot=${e.planSnapshotId} steps=${e.plan?.steps?.length}`);
        for (const s of e.plan?.steps ?? []) {
          const extra =
            s.type === 'tool' ? ` tool=${s.toolName} input=${JSON.stringify(s.input)}` : '';
          console.log(`    - ${s.id} (${s.type})${extra}`);
        }
      } else if (t === 'plan-step-truncated') {
        console.log(`  [${t}] step=${e.stepId} reason=${e.reason}`);
      } else if (t.startsWith('plan-step-')) {
        console.log(`  [${t}] step=${e.stepId} type=${e.stepType} status=${e.status ?? '-'}`);
      } else {
        console.log(`  [${t}]`, e.reason ?? e.planSnapshotId);
      }
    }
  }
  const fcTruncated = events.some((e) => e.type === 'tool-call-truncated');
  if (fcTruncated) console.log('  [WARN] tool-call-truncated — v0.3 FC path should not appear');
}

async function auditReplay(sessionId, label) {
  const replay = await (await fetch(`${API}/api/sessions/${sessionId}/replay`)).json();
  console.log(`\n--- Replay: ${label} ---`);
  console.log('Messages timeline:', replay.messages.map((m) => m.role).join(' → '));
  const assistants = replay.messages.filter((m) => m.role === 'assistant');
  console.log(`Assistant count: ${assistants.length} (v0.4 expects 1 per turn)`);

  const plans = replay.planSnapshots ?? [];
  console.log('Plan snapshots:', plans.length);
  for (const p of plans) {
    console.log(
      `  - id=${p.id.slice(0, 8)}… status=${p.status} steps=${p.plan?.steps?.length ?? 0} trace=${JSON.stringify(p.executionTrace)}`,
    );
  }

  const tools = replay.toolExecutionSnapshots ?? [];
  console.log('Tool snapshots:', tools.length);
  for (const s of tools) {
    console.log(
      `  - ${s.toolName} status=${s.status} planId=${s.planId?.slice(0, 8) ?? 'null'}… planStepId=${s.planStepId ?? 'null'}`,
    );
    if (s.toolOutput && typeof s.toolOutput === 'object' && 'product' in s.toolOutput) {
      console.log(`    output: ${JSON.stringify(s.toolOutput)}`);
    }
  }
  return replay;
}

async function runScenario(title, prompt) {
  console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`);
  const sessionRes = await fetch(`${API}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!sessionRes.ok) throw new Error(`create session ${sessionRes.status}`);
  const { id: sessionId } = await sessionRes.json();
  console.log('Session:', sessionId);
  console.log('User:', prompt);

  const events = await drainChat(sessionId, prompt);
  const types = [...new Set(events.map((e) => e.type))];
  console.log('\nChunk types:', types.join(', '));
  console.log('\nPlanning observability (v0.4):');
  printPlanObservability(events);

  const assistant = events
    .filter((e) => e.type === 'text-delta')
    .map((e) => e.delta)
    .join('');
  console.log('\nFinal assistant:\n', assistant || '(empty — check DASHSCOPE_API_KEY)');

  await auditReplay(sessionId, title);
  return sessionId;
}

async function main() {
  console.log('=== Persist v0.4.0 Planning Runtime Demo ===\n');
  console.log('Web UI (plan chunks hidden): http://localhost:3000\n');

  const health = await fetch(`${API}/api/sessions`, { method: 'POST', body: '{}' }).catch(
    () => null,
  );
  if (!health?.ok) {
    console.error(`API not reachable at ${API}. Start: pnpm run build:packages && pnpm dev`);
    process.exit(1);
  }

  const s1 = await runScenario(
    'Scenario A — RuleBased plan: 1× query_sales + synthesis (IC-PLAN-09/10)',
    '请查询上个月（last_month）按 revenue 指标，销量排名第一的产品是什么？给出产品名和数值。',
  );

  await runScenario(
    'Scenario B — 2 tool steps in plan, only 1 executed (ADR-PLAN-03)',
    '请对比上月和上个季度（last_month vs last_quarter）的 revenue 销量第一产品。',
  );

  console.log('\n=== Demo complete ===');
  console.log(`Scenario A replay: GET ${API}/api/sessions/${s1}/replay`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
