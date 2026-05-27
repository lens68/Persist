import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { ChatMessage } from '@persist/shared';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  title: text('title'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['system', 'user', 'assistant', 'tool'] }).notNull(),
  content: text('content').notNull(),
  completionState: text('completion_state', {
    enum: ['pending', 'streaming', 'completed', 'failed', 'aborted'],
  })
    .notNull()
    .default('completed'),
  providerMetadata: text('provider_metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
});

export const memoryEntries = sqliteTable('memory_entries', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['summary'] }).notNull(),
  content: text('content').notNull(),
  sourceMessageIds: text('source_message_ids_json', { mode: 'json' }).$type<string[]>(),
  metadata: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>(),
  supersededBy: text('superseded_by'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const injectionSnapshots = sqliteTable('injection_snapshots', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  triggerMessageId: text('trigger_message_id').notNull(),
  strategy: text('strategy', { enum: ['summary_plus_recent_k'] }).notNull(),
  injectedMemoryIds: text('injected_memory_ids_json', { mode: 'json' }).$type<string[]>().notNull(),
  resolvedMessages: text('resolved_messages_json', { mode: 'json' })
    .$type<ChatMessage[]>()
    .notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
