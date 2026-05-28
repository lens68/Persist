import { readFileSync } from 'node:fs';
import { QwenProvider } from '../packages/provider/dist/qwen-provider.js';
import { QUERY_SALES_TOOL_DEFINITION } from '../packages/tool/dist/index.js';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const p = new QwenProvider({
  apiKey: process.env.DASHSCOPE_API_KEY,
  defaultModel: process.env.DASHSCOPE_MODEL,
});

const chunks = [];
for await (const c of p.chat({
  sessionId: crypto.randomUUID(),
  messages: [
    {
      role: 'user',
      content:
        '调用 query_sales 工具，arguments 必须是 {"metric":"revenue","period":"last_month"}，然后回答结果。',
    },
  ],
  tools: [QUERY_SALES_TOOL_DEFINITION],
})) {
  chunks.push(c);
}

console.log('types:', chunks.map((c) => c.type).join(', '));
for (const c of chunks) {
  if (c.type === 'tool-call-start' || c.type === 'tool-call-end') {
    console.log(c.type, { id: c.toolCallId, name: c.toolName, arguments: c.arguments });
  }
}
const err = chunks.find((c) => c.type === 'error');
if (err) console.log('error:', err.code, err.message?.slice(0, 500));
const done = chunks.find((c) => c.type === 'done');
console.log('done.toolCalls:', JSON.stringify(done?.providerMetadata?.toolCalls));
