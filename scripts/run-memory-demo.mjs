/**
 * One-off memory demo runner (not part of build). Usage: node scripts/run-memory-demo.mjs
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

async function main() {
  console.log('=== Persist v0.2 Memory Demo ===\n');

  const sessionRes = await fetch(`${API}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const session = await sessionRes.json();
  const sessionId = session.id;
  console.log('Session:', sessionId);
  console.log('Web UI: http://localhost:3000 (paste session id in footer after first message)\n');

  const prompts = [
    '我在做 Persist v0.2 实验：Runtime Continuity Memory。',
    '约束：禁止 Vector DB，只用 summary-based continuity。',
    'Provider-neutral：injection 在 runtime，不在 QwenProvider。',
    'Replay 需要 injectionSnapshots，禁止为 replay 重调 LLM。',
    '请用一句话说明 v0.2 和 v0.1 在上下文上的区别。',
    '根据我们之前的约定，列出三条架构红线。',
  ];

  for (let i = 0; i < prompts.length; i++) {
    console.log(`\n--- Turn ${i + 1} ---`);
    console.log('User:', prompts[i]);
    const events = await drainChat(sessionId, prompts[i]);
    const types = events.map((e) => e.type);
    const assistant = events
      .filter((e) => e.type === 'text-delta')
      .map((e) => e.delta)
      .join('');
    console.log('Chunk types:', [...new Set(types)].join(', '));
    console.log(
      'Assistant (preview):',
      assistant.slice(0, 120) + (assistant.length > 120 ? '…' : ''),
    );

    const memRes = await fetch(`${API}/api/sessions/${sessionId}/memories`);
    const memories = await memRes.json();
    const active = memories.filter((m) => !m.supersededBy);
    console.log(`Memories: total=${memories.length}, active=${active.length}`);
    if (active[0]) {
      console.log('Active summary preview:', active[0].content.slice(0, 160) + '…');
    }
  }

  const replay = await (await fetch(`${API}/api/sessions/${sessionId}/replay`)).json();
  console.log('\n=== Replay audit ===');
  console.log('Messages:', replay.messages.length);
  console.log('Memories:', replay.memories?.length ?? 0);
  console.log('Injection snapshots:', replay.injectionSnapshots?.length ?? 0);
  const lastSnap = replay.injectionSnapshots?.at(-1);
  if (lastSnap) {
    console.log('Last snapshot triggerMessageId:', lastSnap.triggerMessageId);
    console.log(
      'Last resolvedMessages roles:',
      lastSnap.resolvedMessages.map((m) => m.role).join(' → '),
    );
    const sys = lastSnap.resolvedMessages.find((m) => m.role === 'system');
    if (sys) {
      console.log('System injection preview:', sys.content.slice(0, 100) + '…');
    }
  }

  console.log('\n=== Done ===');
  console.log(
    `Open http://localhost:3000 and chat, or inspect:\n  GET ${API}/api/sessions/${sessionId}/memories`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
