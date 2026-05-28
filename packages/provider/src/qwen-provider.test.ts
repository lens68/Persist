import { describe, expect, it } from 'vitest';
import { QwenProvider } from './qwen-provider.js';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('QwenProvider', () => {
  it('normalizes OpenAI-compatible SSE to RuntimeChunks', async () => {
    const provider = new QwenProvider({
      apiKey: 'test-key',
      fetchImpl: async () =>
        sseResponse([
          'data: {"id":"req-1","choices":[{"delta":{"content":"Hel"},"index":0}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"},"index":0}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n\n',
          'data: [DONE]\n\n',
        ]),
    });

    const chunks = [];
    for await (const chunk of provider.chat({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.some((c) => c.type === 'message-start')).toBe(true);
    expect(
      chunks
        .filter((c) => c.type === 'text-delta')
        .map((c) => c.delta)
        .join(''),
    ).toBe('Hello');
    expect(chunks.some((c) => c.type === 'usage')).toBe(true);
    expect(chunks.some((c) => c.type === 'message-end')).toBe(true);
    const done = chunks.find((c) => c.type === 'done');
    expect(done?.type).toBe('done');
    if (done?.type === 'done') {
      expect(done.providerMetadata?.model).toBeDefined();
      expect(done.completionState).toBe('completed');
    }
  });

  it('yields error chunk on HTTP failure', async () => {
    const provider = new QwenProvider({
      apiKey: 'test-key',
      fetchImpl: async () => new Response('bad', { status: 401 }),
    });

    const chunks = [];
    for await (const chunk of provider.chat({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.some((c) => c.type === 'error')).toBe(true);
    expect(chunks.find((c) => c.type === 'done')?.completionState).toBe('failed');
  });

  it('parses tool_calls stream and includes tools in request (FR-TOOL-03)', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new QwenProvider({
      apiKey: 'test-key',
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return sseResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"query_sales","arguments":"{\\"metric\\""}}]},"index":0}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":\\"revenue\\",\\"period\\":\\"last_month\\"}"}}]},"index":0}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"tool_calls","index":0}]}\n\n',
          'data: [DONE]\n\n',
        ]);
      },
    });

    const chunks = [];
    for await (const chunk of provider.chat({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      messages: [{ role: 'user', content: 'sales' }],
      tools: [
        {
          name: 'query_sales',
          description: 'Query sales',
          inputSchema: { type: 'object' },
        },
      ],
    })) {
      chunks.push(chunk);
    }

    expect(requestBody?.tools).toBeDefined();
    expect(requestBody?.tool_choice).toBe('required');
    expect(chunks.some((c) => c.type === 'tool-call-start')).toBe(true);
    expect(chunks.some((c) => c.type === 'tool-call-end')).toBe(true);

    const providerMessageToolCalls = new QwenProvider({
      apiKey: 'test-key',
      fetchImpl: async () =>
        sseResponse([
          'data: {"choices":[{"index":0,"message":{"role":"assistant","tool_calls":[{"id":"call_2","type":"function","function":{"name":"query_sales","arguments":"{\\"metric\\":\\"revenue\\",\\"period\\":\\"last_month\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ]),
    });
    const msgChunks = [];
    for await (const chunk of providerMessageToolCalls.chat({
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
      messages: [{ role: 'user', content: 'sales' }],
      tools: [{ name: 'query_sales', description: 'q', inputSchema: { type: 'object' } }],
    })) {
      msgChunks.push(chunk);
    }
    expect(msgChunks.some((c) => c.type === 'tool-call-end')).toBe(true);
    const msgDone = msgChunks.find((c) => c.type === 'done');
    expect(
      msgDone?.type === 'done' && msgDone.providerMetadata?.toolCalls?.[0]?.arguments,
    ).toContain('last_month');
    const done = chunks.find((c) => c.type === 'done');
    expect(done?.type === 'done' && done.providerMetadata?.toolCalls?.[0]?.name).toBe(
      'query_sales',
    );
  });

  it.skipIf(!process.env.DASHSCOPE_API_KEY)('real Qwen FC integration (NFR-TOOL-09)', async () => {
    const provider = new QwenProvider({
      apiKey: process.env.DASHSCOPE_API_KEY!,
      baseUrl: process.env.DASHSCOPE_BASE_URL,
      defaultModel: process.env.DASHSCOPE_MODEL,
    });
    const chunks = [];
    for await (const chunk of provider.chat({
      sessionId: crypto.randomUUID(),
      messages: [
        { role: 'user', content: 'What was top product by revenue last month? Use query_sales.' },
      ],
      tools: [
        {
          name: 'query_sales',
          description: 'Query sales',
          inputSchema: {
            type: 'object',
            properties: { metric: { type: 'string' }, period: { type: 'string' } },
            required: ['metric', 'period'],
          },
        },
      ],
    })) {
      chunks.push(chunk);
    }
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });
});
