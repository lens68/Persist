'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DRAFT_SESSION_ID, formatRelativeTime } from './workspace-utils';

export interface SessionSummaryView {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  previewText?: string;
}

export interface SessionSidebarHandle {
  refresh: () => Promise<void>;
}

interface SessionSidebarProps {
  activeSessionId: string;
  disabled?: boolean;
  onNewChat?: () => void;
}

export const SessionSidebar = forwardRef<SessionSidebarHandle, SessionSidebarProps>(
  function SessionSidebar({ activeSessionId, disabled = false, onNewChat }, ref) {
    const router = useRouter();
    const [sessions, setSessions] = useState<SessionSummaryView[]>([]);
    const [loading, setLoading] = useState(true);

    const loadSessions = useCallback(async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/sessions');
        if (res.ok) {
          setSessions((await res.json()) as SessionSummaryView[]);
        }
      } finally {
        setLoading(false);
      }
    }, []);

    useImperativeHandle(ref, () => ({ refresh: loadSessions }), [loadSessions]);

    useEffect(() => {
      void loadSessions();
    }, [loadSessions]);

    const handleNewChat = () => {
      if (disabled) return;
      onNewChat?.();
      router.push(`/s/${DRAFT_SESSION_ID}`);
    };

    const handleSelect = (id: string) => {
      if (disabled || id === activeSessionId) return;
      router.push(`/s/${id}`);
    };

    return (
      <aside
        style={{
          minWidth: 220,
          borderRight: '1px solid #ddd',
          padding: '0 12px 16px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={handleNewChat}
          disabled={disabled}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #3949ab',
            background: disabled ? '#eee' : '#eef0ff',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          New Chat
        </button>
        {loading && <p style={{ fontSize: 12, color: '#999', margin: 0 }}>加载会话…</p>}
        {!loading && sessions.length === 0 && (
          <p style={{ fontSize: 12, color: '#999', margin: 0 }}>暂无历史会话</p>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flex: 1 }}>
          {sessions.map((s) => {
            const active = s.id === activeSessionId;
            const title = s.previewText?.trim() ?? '';
            return (
              <li key={s.id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => handleSelect(s.id)}
                  disabled={disabled}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: active ? '1px solid #3949ab' : '1px solid transparent',
                    background: active ? '#eef0ff' : 'transparent',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {title}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    {formatRelativeTime(s.updatedAt)} · {s.messageCount} 条
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    );
  },
);
