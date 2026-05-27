import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { QwenProvider } from '@persist/provider';
import { createDatabase, SqliteSessionStore } from '@persist/storage';
import { registerRoutes } from './routes.js';

// Load monorepo root .env when running from apps/api (pnpm dev).
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const port = Number(process.env.API_PORT ?? 3001);
const databaseUrl = process.env.DATABASE_URL ?? 'file:./.data/persist.db';

async function main() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.warn('[persist/api] DASHSCOPE_API_KEY not set — provider calls will fail');
  }

  const db = createDatabase(databaseUrl);
  const store = new SqliteSessionStore(db);
  const provider = new QwenProvider({
    apiKey: apiKey ?? '',
    baseUrl: process.env.DASHSCOPE_BASE_URL,
    defaultModel: process.env.DASHSCOPE_MODEL,
  });

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await registerRoutes(app, { store, provider });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[persist/api] listening on http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
