/**
 * Full-stack demo: API + Web must already be running.
 * Exercises the same /api/* path the browser uses (via Next rewrite on :3000).
 *
 * Terminal 1: pnpm run build:packages && pnpm dev
 * Terminal 2: pnpm dev:web
 * Then: node scripts/run-full-stack-demo.mjs
 */
const API_DIRECT = process.env.API_URL ?? 'http://localhost:3001';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
/** Chat goes through Next proxy — identical to the Web UI. */
const WEB_API = `${WEB}/api`;

async function waitFor(url, label, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: 'GET' }).catch(() => null);
      if (res?.ok || res?.status === 404 || res?.status === 405) {
        console.log(`[ok] ${label} reachable at ${url}`);
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not reachable at ${url}`);
}

async function drainChat(base, sessionId, content) {
  const res = await fetch(`${base}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}: ${await res.text()}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const events = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (const line of buf.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        events.push(JSON.parse(data));
      } catch {
        /* skip */
      }
    }
    buf = buf.split('\n').pop() ?? '';
  }
  return events;
}

function assertV04(events, replay, { expectTruncated }) {
  const types = new Set(events.map((e) => e.type));
  if (types.has('tool-call-truncated')) {
    throw new Error('v0.3 tool-call-truncated appeared — FC path must not run');
  }
  if (!types.has('plan-generated')) throw new Error('missing plan-generated');
  if (expectTruncated && !types.has('plan-step-truncated')) {
    throw new Error('expected plan-step-truncated');
  }
  const roles = replay.messages.map((m) => m.role).join(' → ');
  if (!roles.includes('user')) throw new Error('no user message');
  if (replay.messages.filter((m) => m.role === 'assistant').length !== 1) {
    throw new Error(`expected 1 assistant, got timeline: ${roles}`);
  }
  if (!(replay.planSnapshots?.length >= 1)) throw new Error('replay missing planSnapshots');
  const tool = replay.toolExecutionSnapshots?.[0];
  if (tool && !tool.planId) throw new Error('tool snapshot missing planId');
}

async function runScenario(base, title, prompt, opts) {
  console.log(`\n--- ${title} ---`);
  const res = await fetch(`${base}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const { id: sessionId } = await res.json();
  const events = await drainChat(base, sessionId, prompt);
  const replay = await (await fetch(`${base}/sessions/${sessionId}/replay`)).json();
  assertV04(events, replay, opts);
  console.log('PASS', title);
  console.log('  chunks:', [...new Set(events.map((e) => e.type))].join(', '));
  console.log('  timeline:', replay.messages.map((m) => m.role).join(' → '));
  console.log('  Web:', `${WEB} (session ${sessionId})`);
  return sessionId;
}

async function main() {
  console.log('=== Persist v0.4 full-stack demo (API + Web proxy) ===\n');
  await waitFor(`${API_DIRECT}/api/sessions`, 'API', 5);
  await waitFor(WEB, 'Web UI', 15);

  const pageRes = await fetch(WEB);
  if (!pageRes.ok) throw new Error(`Web page ${pageRes.status}`);
  console.log(`[ok] Web page HTML ${pageRes.status} (${WEB})`);

  await runScenario(
    WEB_API,
    'Via Web :3000 — Sales top product',
    '请查询上个月（last_month）按 revenue 指标，销量排名第一的产品是什么？给出产品名和数值。',
    { expectTruncated: false },
  );

  await runScenario(
    WEB_API,
    'Via Web :3000 — Compare (2 tool steps, 1 executed)',
    '请对比上月和上个季度 revenue 销量第一产品。',
    { expectTruncated: true },
  );

  console.log('\n=== All scenarios passed (same path as browser UI) ===');
  console.log(`Open ${WEB} to see bubbles — plan chunks are hidden in UI, audit via Replay API.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
