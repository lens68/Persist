'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MemoryPanel, type MemoryEntryView } from '../../memory-panel';
import { PlanPanel, type ReplayView } from '../../plan-panel';
import { SessionSidebar, type SessionSidebarHandle } from '../../session-sidebar';
import {
  createSession,
  isDraftSessionId,
  isValidSessionId,
  LAST_SESSION_KEY,
  toMemoryEntryViews,
  visibleMessagesFromReplay,
  type ChatMessage,
} from '../../workspace-utils';

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

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : undefined;
  const sidebarRef = useRef<SessionSidebarHandle>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memories, setMemories] = useState<MemoryEntryView[]>([]);
  const [replay, setReplay] = useState<ReplayView | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [lastPlanHint, setLastPlanHint] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const assistantRef = useRef('');
  const streamingMessageIdRef = useRef<string | null>(null);

  const applyReplay = useCallback((data: ReplayView) => {
    setReplay(data);
    setMessages(visibleMessagesFromReplay(data));
    setMemories(toMemoryEntryViews(data.memories ?? []));
    setSessionError(null);
    setInputDisabled(false);
  }, []);

  const loadReplay = useCallback(
    async (sid: string): Promise<boolean> => {
      setReplayLoading(true);
      try {
        const res = await fetch(`/api/sessions/${sid}/replay`);
        if (res.ok) {
          applyReplay((await res.json()) as ReplayView);
          return true;
        }
        if (res.status === 404) {
          localStorage.removeItem(LAST_SESSION_KEY);
          setSessionError('会话不存在或已被删除。');
          setMessages([]);
          setMemories([]);
          setReplay(null);
          setInputDisabled(true);
        }
        return false;
      } finally {
        setReplayLoading(false);
      }
    },
    [applyReplay],
  );

  useEffect(() => {
    if (!sessionId) return;
    if (isDraftSessionId(sessionId)) {
      setMessages([]);
      setMemories([]);
      setReplay(null);
      setSessionError(null);
      setInputDisabled(false);
      setLastPlanHint(null);
      return;
    }
    if (!isValidSessionId(sessionId)) {
      localStorage.removeItem(LAST_SESSION_KEY);
      setSessionError('无效的 Session ID。');
      setInputDisabled(true);
      return;
    }
    localStorage.setItem(LAST_SESSION_KEY, sessionId);
    void loadReplay(sessionId);
  }, [sessionId, loadReplay]);

  const handleNewChatFromError = () => {
    router.push('/s/new');
  };

  const resetChatState = () => {
    setMessages([]);
    setMemories([]);
    setReplay(null);
    setSessionError(null);
    setInputDisabled(false);
    setLastPlanHint(null);
    setInput('');
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming || inputDisabled || !sessionId) return;

    const draft = isDraftSessionId(sessionId);
    if (!draft && !isValidSessionId(sessionId)) return;

    let sid = sessionId;
    if (draft) {
      sid = await createSession();
    }

    setInput('');
    setStreaming(true);
    assistantRef.current = '';
    streamingMessageIdRef.current = null;

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
    if (draft) {
      router.replace(`/s/${sid}`);
    }
    await loadReplay(sid);
    await sidebarRef.current?.refresh();
  };

  const activeId = sessionId ?? '';

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
      <h1>Persist</h1>
      <p style={{ color: '#666', margin: '0 0 4px' }}>
        Agent Workspace — <strong>v0.4.1</strong>（Session History & Conversation Continuation）
      </p>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        聊天气泡仅显示最终助手回复；右侧面板展示 Plan / Memory Replay（只读，不重放 Runtime）。
      </p>
      {lastPlanHint && (
        <p style={{ fontSize: 12, color: '#3949ab', margin: '0 0 12px' }}>{lastPlanHint}</p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 1fr 340px',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <SessionSidebar
          ref={sidebarRef}
          activeSessionId={activeId}
          disabled={streaming}
          onNewChat={resetChatState}
        />
        <section>
          {sessionError && (
            <div
              style={{
                border: '1px solid #e57373',
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
                background: '#ffebee',
              }}
            >
              <p style={{ margin: '0 0 12px', color: '#c62828' }}>{sessionError}</p>
              <button
                type="button"
                onClick={() => void handleNewChatFromError()}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #3949ab',
                  background: '#eef0ff',
                  cursor: 'pointer',
                }}
              >
                New Chat
              </button>
            </div>
          )}
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
            {replayLoading && messages.length === 0 && !sessionError && (
              <p style={{ color: '#999' }}>加载会话…</p>
            )}
            {!replayLoading && messages.length === 0 && !sessionError && (
              <p style={{ color: '#999' }}>
                {isDraftSessionId(sessionId) ? '发送首条消息以创建会话…' : '发送消息开始对话…'}
              </p>
            )}
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
              onKeyDown={(e) => e.key === 'Enter' && void send()}
              placeholder="输入消息…"
              style={{ flex: 1, padding: 8 }}
              disabled={streaming || inputDisabled}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={streaming || inputDisabled || !input.trim()}
            >
              发送
            </button>
          </div>
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PlanPanel replay={replay} loading={replayLoading} />
          <MemoryPanel memories={memories} loading={replayLoading} />
        </div>
      </div>
      {sessionId && !isDraftSessionId(sessionId) && (
        <p style={{ fontSize: 12, color: '#999', marginTop: 16 }}>Session: {sessionId}</p>
      )}
    </main>
  );
}
