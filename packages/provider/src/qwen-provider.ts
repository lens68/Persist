import type { ChatProvider, ChatRequest } from '@persist/shared';
import type { ProviderMetadata, RuntimeChunk, TokenUsage, ToolCallMetadata } from '@persist/shared';
import { parseOpenAiSseStream } from './openai-stream-parser.js';
import {
  mergeToolCallDelta,
  toOpenAiApiMessages,
  type AccumulatedToolCall,
} from './openai-messages.js';

export interface QwenProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  fetchImpl?: typeof fetch;
}

/**
 * DashScope OpenAI-compatible HTTP adapter.
 * Vendor protocol only — no runtime or persistence logic.
 */
export class QwenProvider implements ChatProvider {
  readonly id = 'qwen';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: QwenProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.defaultModel = config.defaultModel ?? 'qwen-plus';
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async *chat(request: ChatRequest): AsyncIterable<RuntimeChunk> {
    const startedAt = Date.now();
    const model = request.model ?? this.defaultModel;
    let content = '';

    const messageId = crypto.randomUUID();

    yield {
      type: 'message-start',
      sessionId: request.sessionId,
      messageId,
      role: 'assistant',
      timestamp: new Date(),
    } satisfies RuntimeChunk;

    const body: Record<string, unknown> = {
      model,
      messages: toOpenAiApiMessages(request.messages),
      stream: true,
    };
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
      body.tool_choice = 'auto';
    }

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      yield {
        type: 'error',
        sessionId: request.sessionId,
        timestamp: new Date(),
        code: `http_${response.status}`,
        message: text || response.statusText,
        recoverable: false,
      };
      yield {
        type: 'done',
        sessionId: request.sessionId,
        completionState: 'failed',
        timestamp: new Date(),
      };
      return;
    }

    if (!response.body) {
      yield {
        type: 'error',
        sessionId: request.sessionId,
        timestamp: new Date(),
        code: 'no_body',
        message: 'Response has no body',
      };
      yield {
        type: 'done',
        sessionId: request.sessionId,
        completionState: 'failed',
        timestamp: new Date(),
      };
      return;
    }

    let usage: TokenUsage | undefined;
    let finishReason: string | undefined;
    let requestId: string | undefined;
    const toolCallAccum = new Map<number, AccumulatedToolCall>();
    const emittedToolStarts = new Set<string>();

    for await (const event of parseOpenAiSseStream(response.body)) {
      const id = typeof event.id === 'string' ? event.id : undefined;
      if (id) requestId = id;

      const choices = event.choices as Array<Record<string, unknown>> | undefined;
      const choice = choices?.[0];
      const delta = choice?.delta as Record<string, unknown> | undefined;
      const text = typeof delta?.content === 'string' ? delta.content : '';
      if (text) {
        content += text;
        yield {
          type: 'text-delta',
          sessionId: request.sessionId,
          messageId,
          timestamp: new Date(),
          delta: text,
        };
      }

      const deltaToolCalls = delta?.tool_calls as Array<Record<string, unknown>> | undefined;
      if (deltaToolCalls && deltaToolCalls.length > 0) {
        mergeToolCallDelta(toolCallAccum, deltaToolCalls);
        for (const tc of toolCallAccum.values()) {
          if (tc.id && tc.name && !emittedToolStarts.has(tc.id)) {
            emittedToolStarts.add(tc.id);
            yield {
              type: 'tool-call-start',
              sessionId: request.sessionId,
              timestamp: new Date(),
              toolCallId: tc.id,
              toolName: tc.name,
              arguments: tc.arguments,
            };
          }
        }
      }

      const fr = choice?.finish_reason;
      if (typeof fr === 'string' && fr !== 'null') finishReason = fr;

      const u = event.usage as Record<string, unknown> | undefined;
      if (u) {
        usage = {
          promptTokens: typeof u.prompt_tokens === 'number' ? u.prompt_tokens : undefined,
          completionTokens:
            typeof u.completion_tokens === 'number' ? u.completion_tokens : undefined,
          totalTokens: typeof u.total_tokens === 'number' ? u.total_tokens : undefined,
        };
        yield {
          type: 'usage',
          sessionId: request.sessionId,
          messageId,
          timestamp: new Date(),
          usage,
        };
      }
    }

    const toolCalls: ToolCallMetadata[] = [...toolCallAccum.values()]
      .filter((tc) => tc.id && tc.name)
      .map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.arguments }));

    for (const tc of toolCalls) {
      yield {
        type: 'tool-call-end',
        sessionId: request.sessionId,
        timestamp: new Date(),
        toolCallId: tc.id,
        toolName: tc.name,
        arguments: tc.arguments,
      };
    }

    yield {
      type: 'message-end',
      sessionId: request.sessionId,
      messageId,
      timestamp: new Date(),
      content,
    };

    const latencyMs = Date.now() - startedAt;
    const providerMetadata: ProviderMetadata = {
      requestId,
      model,
      finishReason,
      usage,
      latencyMs,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };

    yield {
      type: 'done',
      sessionId: request.sessionId,
      messageId,
      completionState: 'completed',
      timestamp: new Date(),
      providerMetadata,
    };
  }
}
