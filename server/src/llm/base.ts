export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
}

export interface EmbeddingResponse {
  vectors: number[][];
}

export interface LLMAdapter {
  chat(messages: ChatMessage[], signal?: AbortSignal): Promise<ChatResponse>;
  chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    onDone?: () => void,
    signal?: AbortSignal,
  ): Promise<ChatResponse>;
  embed(texts: string[], signal?: AbortSignal): Promise<EmbeddingResponse>;
}
