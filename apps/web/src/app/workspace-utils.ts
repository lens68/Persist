import type { MemoryEntryView } from './memory-panel';
import type { ReplayView } from './plan-panel';

export const LAST_SESSION_KEY = 'persist:lastSessionId';

/** Draft workspace route — no persisted session until first user message (ADR-HISTORY-08). */
export const DRAFT_SESSION_ID = 'new';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDraftSessionId(id: string | undefined): id is typeof DRAFT_SESSION_ID {
  return id === DRAFT_SESSION_ID;
}

export function isValidSessionId(id: string | undefined): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

export interface ChatMessage {
  role: string;
  content: string;
}

export function visibleMessagesFromReplay(replay: ReplayView): ChatMessage[] {
  return replay.messages
    .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content?.trim()))
    .map((m) => ({ role: m.role, content: m.content }));
}

interface ReplayMemory {
  id: string;
  type: string;
  content: string;
  sourceMessageIds?: string[];
  createdAt: string | Date;
  supersededBy?: string;
}

export function toMemoryEntryViews(memories: ReplayMemory[]): MemoryEntryView[] {
  return memories.map((m) => ({
    id: m.id,
    type: m.type,
    content: m.content,
    sourceMessageIds: m.sourceMessageIds,
    supersededBy: m.supersededBy,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
  }));
}

export function formatRelativeTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return date.toLocaleDateString('zh-CN');
}

export async function createSession(): Promise<string> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`create session failed: ${res.status}`);
  const session = (await res.json()) as { id: string };
  localStorage.setItem(LAST_SESSION_KEY, session.id);
  return session.id;
}
