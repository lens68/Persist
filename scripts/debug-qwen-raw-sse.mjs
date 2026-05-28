import { readFileSync } from 'node:fs';
import { QUERY_SALES_TOOL_DEFINITION } from '../packages/tool/dist/index.js';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const body = {
  model: process.env.DASHSCOPE_MODEL ?? 'qwen-plus',
  messages: [
    {
      role: 'user',
      content:
        '请查询上个月（last_month）按 revenue 指标，销量排名第一的产品是什么？给出产品名和数值。',
    },
  ],
  stream: true,
  tools: [
    {
      type: 'function',
      function: {
        name: QUERY_SALES_TOOL_DEFINITION.name,
        description: QUERY_SALES_TOOL_DEFINITION.description,
        parameters: QUERY_SALES_TOOL_DEFINITION.inputSchema,
      },
    },
  ],
  tool_choice: 'required',
};

const res = await fetch(
  `${process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'}/chat/completions`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify(body),
  },
);

console.log('status', res.status);
const text = await res.text();
for (const line of text.split('\n').filter((l) => l.startsWith('data:') && !l.includes('[DONE]'))) {
  console.log(line.slice(0, 500));
}
