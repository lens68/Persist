import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QwenProvider } from '../packages/provider/dist/qwen-provider.js';
import { QUERY_SALES_TOOL_DEFINITION } from '../packages/tool/dist/index.js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const p = new QwenProvider({
  apiKey: process.env.DASHSCOPE_API_KEY,
  defaultModel: process.env.DASHSCOPE_MODEL,
  baseUrl: process.env.DASHSCOPE_BASE_URL,
});

const chunks = [];
for await (const c of p.chat({
  sessionId: crypto.randomUUID(),
  messages: [
    {
      role: 'user',
      content:
        '请查询上个月（last_month）按 revenue 指标，销量排名第一的产品是什么？给出产品名和数值。',
    },
  ],
  tools: [QUERY_SALES_TOOL_DEFINITION],
})) {
  chunks.push(c);
}

console.log('types:', [...new Set(chunks.map((c) => c.type))].join(', '));
for (const c of chunks) {
  if (c.type === 'tool-call-end') console.log('END', c.toolName, c.arguments);
  if (c.type === 'error') console.log('ERR', c.message?.slice(0, 200));
}
const done = chunks.find((c) => c.type === 'done');
console.log('finish:', done?.providerMetadata?.finishReason);
console.log('toolCalls:', JSON.stringify(done?.providerMetadata?.toolCalls));
