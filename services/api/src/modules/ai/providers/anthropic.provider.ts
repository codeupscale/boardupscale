import { Logger } from '@nestjs/common';
import {
  LlmProvider,
  ChatCompletionParams,
  ChatCompletionResult,
  StreamChunk,
  EmbeddingResult,
} from './llm-provider.interface';

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private client: any = null;
  private available = false;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.model = model;

    if (!apiKey) {
      this.logger.warn('No API key provided — Anthropic provider unavailable');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey });
      this.available = true;
      this.logger.log(`Anthropic provider initialized (model: ${model})`);
    } catch (err: any) {
      this.logger.warn(`Anthropic init failed: ${err.message}`);
    }
  }

  isAvailable(): boolean {
    return this.available && this.client != null;
  }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const { system, messages } = this.convertMessages(params.messages);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: params.maxTokens || 1000,
      temperature: params.temperature ?? 0.3,
      ...(system ? { system } : {}),
      messages,
    });

    const content = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    return {
      content,
      usage: {
        promptTokens: response.usage?.input_tokens || 0,
        completionTokens: response.usage?.output_tokens || 0,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      },
    };
  }

  async *chatCompletionStream(params: ChatCompletionParams): AsyncGenerator<StreamChunk> {
    const { system, messages } = this.convertMessages(params.messages);

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: params.maxTokens || 1500,
      temperature: params.temperature ?? 0.3,
      ...(system ? { system } : {}),
      messages,
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (params.signal?.aborted) break;

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield { type: 'chunk', content: event.delta.text };
      }

      if (event.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens || 0;
      }

      if (event.type === 'message_start' && event.message?.usage) {
        inputTokens = event.message.usage.input_tokens || 0;
      }
    }

    yield {
      type: 'done',
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }

  async generateEmbedding(_text: string): Promise<EmbeddingResult | null> {
    // Anthropic does not offer an embeddings API
    // Fall back to null — the system will skip vector search gracefully
    this.logger.debug('Anthropic does not support embeddings — skipping');
    return null;
  }

  /**
   * Convert OpenAI-style messages to Anthropic format.
   * Anthropic uses a separate 'system' parameter, and only 'user'/'assistant' roles in messages.
   */
  private convertMessages(messages: Array<{ role: string; content: string }>): {
    system: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    let system = '';
    const converted: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system += (system ? '\n' : '') + msg.content;
      } else {
        converted.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    return { system, messages: converted };
  }
}
