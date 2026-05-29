'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isValidSessionId, LAST_SESSION_KEY, DRAFT_SESSION_ID } from './workspace-utils';

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(LAST_SESSION_KEY);
    if (!stored || !isValidSessionId(stored)) {
      if (stored) localStorage.removeItem(LAST_SESSION_KEY);
      setReady(true);
      return;
    }

    void fetch(`/api/sessions/${stored}/replay`).then((res) => {
      if (res.ok) {
        router.replace(`/s/${stored}`);
        return;
      }
      localStorage.removeItem(LAST_SESSION_KEY);
      setReady(true);
    });
  }, [router]);

  const handleNewChat = () => {
    router.push(`/s/${DRAFT_SESSION_ID}`);
  };

  if (!ready) {
    return (
      <main style={{ maxWidth: 480, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>加载中…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
      <h1 style={{ marginBottom: 8 }}>Persist</h1>
      <p style={{ color: '#666', margin: '0 0 24px' }}>
        Agent Workspace — <strong>v0.4.1</strong>
      </p>
      <p style={{ color: '#888', fontSize: 14, margin: '0 0 24px' }}>
        选择或新建会话以开始。历史会话可在 Sidebar 中切换与续聊。
      </p>
      <button
        type="button"
        onClick={handleNewChat}
        style={{
          padding: '12px 24px',
          borderRadius: 8,
          border: '1px solid #3949ab',
          background: '#eef0ff',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: 15,
        }}
      >
        New Chat
      </button>
    </main>
  );
}
