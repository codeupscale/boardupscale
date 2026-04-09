/**
 * LLM Provider abstraction — allows swapping between OpenAI, Anthropic, local models, etc.
 * All AI interactions go through this interface.
 */
export interface ChatCompletionParams {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  type: 'chunk' | 'done';
  content?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
}

export interface LlmProvider {
  readonly name: string;

  /** Check if the provider is initialized and ready */
  isAvailable(): boolean;

  /** Generate a chat completion (single response) */
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;

  /** Generate a streaming chat completion */
  chatCompletionStream(params: ChatCompletionParams): AsyncGenerator<StreamChunk>;

  /** Generate an embedding vector for text */
  generateEmbedding(text: string): Promise<EmbeddingResult | null>;
}
