import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function createDatabase(databaseUrl: string) {
  const raw = databaseUrl.replace(/^file:/, '');
  const isMemory = raw === ':memory:' || raw.startsWith(':memory:');
  const filePath = isMemory ? raw : resolve(raw);
  if (!isMemory) {
    mkdirSync(dirname(filePath), { recursive: true });
  }
  const sqlite = new Database(filePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrateDatabase(sqlite);
  return db;
}

export function migrateDatabase(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      completion_state TEXT NOT NULL DEFAULT 'completed',
      provider_metadata TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      source_message_ids_json TEXT,
      metadata_json TEXT,
      superseded_by TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS injection_snapshots (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      trigger_message_id TEXT NOT NULL,
      strategy TEXT NOT NULL,
      injected_memory_ids_json TEXT NOT NULL,
      resolved_messages_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tool_execution_snapshots (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      trigger_message_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      tool_input_json TEXT NOT NULL,
      tool_output_json TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      payload_truncated INTEGER
    );
  `);

  const messageCols = sqlite.prepare(`PRAGMA table_info(messages)`).all() as { name: string }[];
  const colNames = new Set(messageCols.map((c) => c.name));
  if (!colNames.has('tool_call_id')) {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN tool_call_id TEXT`);
  }
  if (!colNames.has('tool_name')) {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN tool_name TEXT`);
  }
}
