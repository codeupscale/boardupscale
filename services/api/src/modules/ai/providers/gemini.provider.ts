import { Logger } from '@nestjs/common';
import {
  LlmProvider,
  ChatCompletionParams,
  ChatCompletionResult,
  StreamChunk,
  EmbeddingResult,
} from './llm-provider.interface';

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);
  private genAI: any = null;
  private model: any = null;
  private embeddingModelInstance: any = null;
  private available = false;
  private modelName: string;
  private embeddingModel: string;

  constructor(apiKey: string, model: string, embeddingModel: string) {
    this.modelName = model;
    this.embeddingModel = embeddingModel;

    if (!apiKey) {
      this.logger.warn('No API key provided — Gemini provider unavailable');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: this.modelName });
      this.embeddingModelInstance = this.genAI.getGenerativeModel({ model: this.embeddingModel });
      this.available = true;
      this.logger.log(`Gemini provider initialized (model: ${model})`);
    } catch (err: any) {
      this.logger.warn(`Gemini init failed: ${err.message}`);
    }
  }

  isAvailable(): boolean {
    return this.available && this.model != null;
  }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    // Convert OpenAI-style messages to Gemini format
    const { systemInstruction, contents } = this.convertMessages(params.messages);

    const genModel = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: params.maxTokens || 1000,
        temperature: params.temperature ?? 0.3,
      },
    });

    const result = await genModel.generateContent({ contents });
    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    return {
      content: text,
      usage: {
        promptTokens: usage?.promptTokenCount || 0,
        completionTokens: usage?.candidatesTokenCount || 0,
        totalTokens: usage?.totalTokenCount || 0,
      },
    };
  }

  async *chatCompletionStream(params: ChatCompletionParams): AsyncGenerator<StreamChunk> {
    const { systemInstruction, contents } = this.convertMessages(params.messages);

    const genModel = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: params.maxTokens || 1500,
        temperature: params.temperature ?? 0.3,
      },
    });

    const result = await genModel.generateContentStream({ contents });

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    for await (const chunk of result.stream) {
      if (params.signal?.aborted) break;

      const text = chunk.text();
      if (text) {
        yield { type: 'chunk', content: text };
      }

      const usage = chunk.usageMetadata;
      if (usage) {
        totalPromptTokens = usage.promptTokenCount || 0;
        totalCompletionTokens = usage.candidatesTokenCount || 0;
      }
    }

    yield {
      type: 'done',
      usage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
      },
    };
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult | null> {
    try {
      const result = await this.embeddingModelInstance.embedContent(text.slice(0, 8000));
      const embedding = result.embedding.values;
      return { embedding, dimensions: embedding.length };
    } catch (err: any) {
      this.logger.warn(`Gemini embedding failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Convert OpenAI-style messages to Gemini format.
   * Gemini uses systemInstruction separately, and 'contents' with 'user'/'model' roles.
   */
  private convertMessages(messages: Array<{ role: string; content: string }>): {
    systemInstruction: string;
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  } {
    let systemInstruction = '';
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += (systemInstruction ? '\n' : '') + msg.content;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    // Gemini requires at least one user message
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    return { systemInstruction, contents };
  }
}
