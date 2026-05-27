'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MemoryPanel, type MemoryEntryView } from './memory-panel';

interface Message {
  role: string;
  content: string;
}

export default function HomePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<MemoryEntryView[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const assistantRef = useRef('');

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
          const chunk = JSON.parse(data) as { type: string; delta?: string; content?: string };
          if (chunk.type === 'memory-injected' || chunk.type === 'memory-generated') {
            continue;
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
          if (chunk.type === 'message-end' && chunk.content) {
            assistantRef.current = chunk.content;
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    setStreaming(false);
    await loadMemories(sid);
  };

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px' }}>
      <h1>Persist</h1>
      <p style={{ color: '#666' }}>
        Memory-aware Execution Runtime — v0.2 UI shell（仅 HTTP，无 Runtime 逻辑）
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
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
        <MemoryPanel memories={memories} loading={memoriesLoading} />
      </div>
      {sessionId && (
        <p style={{ fontSize: 12, color: '#999', marginTop: 16 }}>Session: {sessionId}</p>
      )}
    </main>
  );
}
