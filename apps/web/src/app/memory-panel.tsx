'use client';

export interface MemoryEntryView {
  id: string;
  type: string;
  content: string;
  sourceMessageIds?: string[];
  createdAt: string;
  supersededBy?: string;
}

interface MemoryPanelProps {
  memories: MemoryEntryView[];
  loading?: boolean;
}

/** Read-only Runtime Continuity Memory inspect panel (FR-MEM-13 UI, Phase 8). */
export function MemoryPanel({ memories, loading }: MemoryPanelProps) {
  const active = memories.filter((m) => !m.supersededBy);
  const archived = memories.filter((m) => m.supersededBy);

  return (
    <aside
      style={{
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 16,
        background: '#f8f9fa',
        minHeight: 320,
      }}
    >
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Runtime Continuity Memory</h2>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
        只读 · 持久化 continuity artifact（非聊天记录）
      </p>
      {loading && <p style={{ color: '#999', fontSize: 13 }}>加载中…</p>}
      {!loading && memories.length === 0 && (
        <p style={{ color: '#999', fontSize: 13 }}>尚无 summary memory</p>
      )}
      {active.map((m) => (
        <MemoryCard key={m.id} entry={m} badge="Active" />
      ))}
      {archived.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: '#666' }}>
            已取代 ({archived.length})
          </summary>
          {archived.map((m) => (
            <MemoryCard key={m.id} entry={m} badge="Superseded" muted />
          ))}
        </details>
      )}
    </aside>
  );
}

function MemoryCard({
  entry,
  badge,
  muted,
}: {
  entry: MemoryEntryView;
  badge: string;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 6,
        background: muted ? '#eee' : '#fff',
        border: '1px solid #e0e0e0',
        opacity: muted ? 0.85 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: muted ? '#888' : '#2e7d32' }}>
          {badge}
        </span>
        <span style={{ fontSize: 11, color: '#999' }}>
          {new Date(entry.createdAt).toLocaleString()}
        </span>
      </div>
      <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{entry.content}</p>
      {entry.sourceMessageIds && entry.sourceMessageIds.length > 0 && (
        <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
          source messages: {entry.sourceMessageIds.length}
        </p>
      )}
    </div>
  );
}
