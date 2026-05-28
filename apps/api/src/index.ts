import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { LlmSummaryMemoryGenerator, QwenProvider } from '@persist/provider';
import {
  createDatabase,
  SqliteInjectionSnapshotStore,
  SqliteInProcessToolExecutor,
  SqliteMemoryStore,
  SqliteSessionStore,
  SqliteToolExecutionSnapshotStore,
  initSalesFixtureDb,
} from '@persist/storage';
import { QUERY_SALES_TOOL_DEFINITION } from '@persist/tool';
import { registerRoutes } from './routes.js';

// Load monorepo root .env when running from apps/api (pnpm dev).
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const port = Number(process.env.API_PORT ?? 3001);
const databaseUrl = process.env.DATABASE_URL ?? 'file:./.data/persist.db';
const salesFixtureUrl = process.env.SALES_FIXTURE_DATABASE_URL ?? 'file:./.data/sales-fixture.db';

async function main() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.warn('[persist/api] DASHSCOPE_API_KEY not set — provider calls will fail');
  }

  initSalesFixtureDb(salesFixtureUrl);

  const db = createDatabase(databaseUrl);
  const store = new SqliteSessionStore(db);
  const memoryStore = new SqliteMemoryStore(db);
  const injectionSnapshotStore = new SqliteInjectionSnapshotStore(db);
  const toolExecutionSnapshotStore = new SqliteToolExecutionSnapshotStore(db);
  const toolExecutor = new SqliteInProcessToolExecutor({
    fixtureDatabaseUrl: salesFixtureUrl,
  });
  const toolDefinitions = [QUERY_SALES_TOOL_DEFINITION];
  const provider = new QwenProvider({
    apiKey: apiKey ?? '',
    baseUrl: process.env.DASHSCOPE_BASE_URL,
    defaultModel: process.env.DASHSCOPE_MODEL,
  });
  const memoryGenerator = new LlmSummaryMemoryGenerator(provider, {
    model: process.env.DASHSCOPE_MODEL,
  });

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await registerRoutes(app, {
    store,
    memoryStore,
    injectionSnapshotStore,
    toolExecutionSnapshotStore,
    provider,
    memoryGenerator,
    toolExecutor,
    toolDefinitions,
  });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[persist/api] listening on http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
