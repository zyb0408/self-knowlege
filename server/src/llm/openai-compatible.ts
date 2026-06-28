import { LLMAdapter, ChatMessage, ChatResponse, EmbeddingResponse } from './base';
import { config } from '../config';

function createTimeoutController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller;
}

export class OpenAICompatibleLLM implements LLMAdapter {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private timeout: number;

  constructor(options: {
    baseUrl: string;
    apiKey: string;
    model: string;
    timeout?: number;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeout = options.timeout ?? config.llmTimeout;
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<ChatResponse> {
    const controller = signal ?? createTimeoutController(this.timeout);
    const abortSignal: AbortSignal = controller instanceof AbortController ? controller.signal : controller;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    return { content };
  }

  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    onDone?: () => void,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const controller = signal ?? createTimeoutController(this.timeout);
    const abortSignal: AbortSignal = controller instanceof AbortController ? controller.signal : controller;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error (${response.status}): ${error}`);
    }

    let fullContent = '';

    if (!response.body) {
      return { content: '' };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            onDone?.();
            break;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
            };
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (chunk) {
              fullContent += chunk;
              onChunk(chunk);
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content: fullContent };
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const controller = signal ?? createTimeoutController(this.timeout);
    const abortSignal: AbortSignal = controller instanceof AbortController ? controller.signal : controller;
    const response = await fetch(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: abortSignal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`获取模型列表失败 (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      data?: { id: string }[];
    };

    return (data.data ?? []).map((m) => m.id);
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<EmbeddingResponse> {
    const controller = signal ?? createTimeoutController(this.timeout);
    const abortSignal: AbortSignal = controller instanceof AbortController ? controller.signal : controller;
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      data?: { embedding?: number[] }[];
    };

    return {
      vectors: (data.data ?? []).map((d) => d.embedding ?? []),
    };
  }
}
