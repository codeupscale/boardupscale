import { Logger } from '@nestjs/common';
import {
  LlmProvider,
  ChatCompletionParams,
  ChatCompletionResult,
  StreamChunk,
  EmbeddingResult,
} from './llm-provider.interface';

export class OpenAIProvider implements LlmProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private client: any = null;
  private available = false;
  private model: string;
  private embeddingModel: string;

  constructor(apiKey: string, model: string, embeddingModel: string) {
    this.model = model;
    this.embeddingModel = embeddingModel;

    if (!apiKey) {
      this.logger.warn('No API key provided — OpenAI provider unavailable');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const OpenAI = require('openai').default || require('openai');
      this.client = new OpenAI({ apiKey });
      this.available = true;
      this.logger.log(`OpenAI provider initialized (model: ${model})`);
    } catch (err: any) {
      this.logger.warn(`OpenAI init failed: ${err.message}`);
    }
  }

  isAvailable(): boolean {
    return this.available && this.client != null;
  }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: params.messages,
      max_tokens: params.maxTokens || 1000,
      temperature: params.temperature ?? 0.3,
    });

    const choice = response.choices[0];
    const usage = response.usage;

    return {
      content: choice.message.content || '',
      usage: {
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
    };
  }

  async *chatCompletionStream(params: ChatCompletionParams): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: params.messages,
      max_tokens: params.maxTokens || 1500,
      temperature: params.temperature ?? 0.3,
      stream: true,
      ...(params.signal ? { signal: params.signal } : {}),
    });

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      if (params.signal?.aborted) break;

      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        yield { type: 'chunk', content: delta };
      }
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens || 0;
        completionTokens = chunk.usage.completion_tokens || 0;
      }
    }

    yield {
      type: 'done',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult | null> {
    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: text.slice(0, 8000),
      });
      const embedding = response.data[0].embedding;
      return { embedding, dimensions: embedding.length };
    } catch (err: any) {
      this.logger.warn(`Embedding failed: ${err.message}`);
      return null;
    }
  }
}
