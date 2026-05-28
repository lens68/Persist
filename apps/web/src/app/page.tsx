'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MemoryPanel, type MemoryEntryView } from './memory-panel';
import { PlanPanel, type ReplayView } from './plan-panel';

interface Message {
  role: string;
  content: string;
}

/** SSE chunks that must not drive the chat bubble (observability + tool execution). */
const IGNORED_SSE_TYPES = new Set([
  'memory-injected',
  'memory-generated',
  'tool-call-start',
  'tool-call-end',
  'tool-call-truncated',
  'tool-payload-truncated',
  'tool-result',
  'plan-generated',
  'plan-invalid',
  'plan-step-start',
  'plan-step-end',
  'plan-step-truncated',
]);

export default function HomePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<MemoryEntryView[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [replay, setReplay] = useState<ReplayView | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [lastPlanHint, setLastPlanHint] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const assistantRef = useRef('');
  const streamingMessageIdRef = useRef<string | null>(null);

  const syncMessagesFromServer = useCallback(async (sid: string) => {
    const res = await fetch(`/api/sessions/${sid}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      messages: Array<{ role: string; content: string }>;
    };
    const visible = data.messages.filter(
      (m) => m.role === 'user' || (m.role === 'assistant' && m.content?.trim()),
    );
    setMessages(visible.map((m) => ({ role: m.role, content: m.content })));
  }, []);

  const loadReplay = useCallback(async (sid: string) => {
    setReplayLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sid}/replay`);
      if (res.ok) {
        setReplay((await res.json()) as ReplayView);
      }
    } finally {
      setReplayLoading(false);
    }
  }, []);

  const loadMemories = useCallback(async (sid: string) => {
    setMemoriesLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sid}/memories`);
      if (res.ok) {
        setMemories((await res.json()) as MemoryEntryView[]);
      }
    } finally {
      setMemoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionId) void loadMemories(sessionId);
  }, [sessionId, loadMemories]);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const session = await res.json();
    setSessionId(session.id);
    return session.id as string;
  }, [sessionId]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    setStreaming(true);
    assistantRef.current = '';
    streamingMessageIdRef.current = null;

    const sid = await ensureSession();
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);

    const res = await fetch(`/api/sessions/${sid}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });

    if (!res.body) {
      setStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data) as {
            type: string;
            delta?: string;
            content?: string;
            messageId?: string;
            message?: string;
          };
          if (chunk.type === 'plan-generated') {
            const p = chunk as { plan?: { steps?: unknown[] } };
            setLastPlanHint(`Plan 已生成 · ${p.plan?.steps?.length ?? 0} steps`);
          }
          if (chunk.type === 'plan-step-truncated') {
            const p = chunk as { stepId?: string };
            setLastPlanHint(`Plan step 已截断（未执行）: ${p.stepId ?? '?'}`);
          }
          if (IGNORED_SSE_TYPES.has(chunk.type)) {
            continue;
          }
          if (chunk.type === 'message-start' && chunk.messageId) {
            const mid = chunk.messageId;
            if (streamingMessageIdRef.current && streamingMessageIdRef.current !== mid) {
              assistantRef.current = '';
              setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
            }
            streamingMessageIdRef.current = mid;
          }
          if (chunk.type === 'error') {
            assistantRef.current = `[错误] ${chunk.message ?? 'unknown'}`;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') {
                next[next.length - 1] = { role: 'assistant', content: assistantRef.current };
              }
              return next;
            });
          }
          if (chunk.type === 'text-delta' && chunk.delta) {
            assistantRef.current += chunk.delta;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') {
                next[next.length - 1] = { role: 'assistant', content: assistantRef.current };
              }
              return next;
            });
          }
          if (chunk.type === 'message-end' && chunk.content?.trim()) {
            assistantRef.current = chunk.content;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') {
                next[next.length - 1] = { role: 'assistant', content: assistantRef.current };
              }
              return next;
            });
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    setStreaming(false);
    await syncMessagesFromServer(sid);
    await loadMemories(sid);
    await loadReplay(sid);
  };

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px' }}>
      <h1>Persist</h1>
      <p style={{ color: '#666', margin: '0 0 4px' }}>
        Planning Execution Runtime — <strong>v0.4.0</strong>（Plan → 至多 1× Tool → Synthesis）
      </p>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        聊天气泡仅显示最终助手回复；右侧 Planning 面板展示 Plan / 截断 / Replay 时间线（与 v0.3 FC
        双 Provider 不同）。
      </p>
      {lastPlanHint && (
        <p style={{ fontSize: 12, color: '#3949ab', margin: '0 0 12px' }}>{lastPlanHint}</p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <section>
          <div
            style={{
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: 16,
              minHeight: 320,
              marginBottom: 16,
              background: '#fafafa',
            }}
          >
            {messages.length === 0 && <p style={{ color: '#999' }}>发送消息开始对话…</p>}
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <strong>{m.role === 'user' ? '你' : '助手'}：</strong>
                <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="输入消息…"
              style={{ flex: 1, padding: 8 }}
              disabled={streaming}
            />
            <button type="button" onClick={send} disabled={streaming || !input.trim()}>
              发送
            </button>
          </div>
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PlanPanel replay={replay} loading={replayLoading} />
          <MemoryPanel memories={memories} loading={memoriesLoading} />
        </div>
      </div>
      {sessionId && (
        <p style={{ fontSize: 12, color: '#999', marginTop: 16 }}>Session: {sessionId}</p>
      )}
    </main>
  );
}
