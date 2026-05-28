/**
 * Persist v0.3 Tool demo (实验7 — 销量分析 / query_sales).
 * Prereq: API on :3001 with DASHSCOPE_API_KEY. Usage: node scripts/run-tool-demo.mjs
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

function summarizeToolEvents(events) {
  const toolCalls = events.filter((e) => e.type === 'tool-call-start');
  const toolResults = events.filter((e) => e.type === 'tool-result');
  const truncated = events.some((e) => e.type === 'tool-call-truncated');
  return { toolCalls, toolResults, truncated };
}

async function main() {
  console.log('=== Persist v0.3 Tool Demo (query_sales / Sales Agent) ===\n');

  const sessionRes = await fetch(`${API}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!sessionRes.ok) throw new Error(`create session ${sessionRes.status}`);
  const session = await sessionRes.json();
  const sessionId = session.id;
  console.log('Session:', sessionId);
  console.log('Web UI: http://localhost:3000\n');

  const prompt =
    '请用 query_sales 工具查询：上个月（last_month）按 revenue 指标，销量排名第一的产品是什么？给出产品名和数值。';

  console.log('User:', prompt);
  console.log('\n--- Streaming (Runtime events) ---\n');

  const events = await drainChat(sessionId, prompt);
  const types = [...new Set(events.map((e) => e.type))];
  console.log('Chunk types seen:', types.join(', '));

  const { toolCalls, toolResults, truncated } = summarizeToolEvents(events);
  if (truncated) console.log('[policy] tool-call-truncated (multi-call guard)');
  for (const tc of toolCalls) {
    console.log(`[tool] ${tc.toolName} callId=${tc.toolCallId}`);
    if (tc.argumentsPreview) console.log('  args preview:', tc.argumentsPreview);
  }
  for (const tr of toolResults) {
    console.log(`[tool-result] ${tr.toolName} success=${tr.success}`);
    if (tr.outputPreview) console.log('  output preview:', tr.outputPreview);
  }

  const assistant = events
    .filter((e) => e.type === 'text-delta')
    .map((e) => e.delta)
    .join('');
  console.log('\n--- Final assistant (UI bubble) ---\n');
  console.log(assistant || '(empty — check provider / API key)');

  const replay = await (await fetch(`${API}/api/sessions/${sessionId}/replay`)).json();
  console.log('\n=== Replay audit (no LLM / no Tool re-exec) ===');
  console.log('Messages:', replay.messages.length);
  const snaps = replay.toolExecutionSnapshots ?? [];
  console.log('Tool execution snapshots:', snaps.length);
  for (const s of snaps) {
    console.log(`  - ${s.toolName} status=${s.status} callId=${s.toolCallId}`);
    if (s.resultPreview) console.log(`    result: ${s.resultPreview}`);
  }

  const done = events.find((e) => e.type === 'done');
  if (done?.providerMetadata?.toolCalls?.length) {
    console.log('\nProvider metadata toolCalls:', JSON.stringify(done.providerMetadata.toolCalls));
  }

  console.log('\n=== Done ===');
  console.log(`Replay: GET ${API}/api/sessions/${sessionId}/replay`);
  console.log(`Session: GET ${API}/api/sessions/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
