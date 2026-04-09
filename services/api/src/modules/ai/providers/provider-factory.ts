import { Logger } from '@nestjs/common';
import { LlmProvider } from './llm-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { GeminiProvider } from './gemini.provider';
import { AnthropicProvider } from './anthropic.provider';

export type AiProviderType = 'openai' | 'gemini' | 'anthropic';

interface ProviderConfig {
  provider: AiProviderType;
  apiKey: string;
  model: string;
  embeddingModel: string;
}

const DEFAULT_MODELS: Record<AiProviderType, { model: string; embeddingModel: string }> = {
  openai: { model: 'gpt-4o-mini', embeddingModel: 'text-embedding-3-small' },
  gemini: { model: 'gemini-2.5-flash', embeddingModel: 'gemini-embedding-001' },
  anthropic: { model: 'claude-sonnet-4-20250514', embeddingModel: '' },
};

/**
 * Creates the appropriate LLM provider based on configuration.
 * Single place to add new providers — just add a case and a default model.
 */
export function createProvider(config: ProviderConfig): LlmProvider {
  const logger = new Logger('ProviderFactory');
  const { provider, apiKey, model, embeddingModel } = config;

  const defaults = DEFAULT_MODELS[provider];
  if (!defaults) {
    logger.error(`Unknown AI provider: "${provider}". Supported: ${Object.keys(DEFAULT_MODELS).join(', ')}`);
    // Return a disabled OpenAI provider as fallback
    return new OpenAIProvider('', 'gpt-4o-mini', 'text-embedding-3-small');
  }

  const resolvedModel = model || defaults.model;
  const resolvedEmbedding = embeddingModel || defaults.embeddingModel;

  logger.log(`Creating ${provider} provider (model: ${resolvedModel})`);

  switch (provider) {
    case 'openai':
      return new OpenAIProvider(apiKey, resolvedModel, resolvedEmbedding);

    case 'gemini':
      return new GeminiProvider(apiKey, resolvedModel, resolvedEmbedding);

    case 'anthropic':
      return new AnthropicProvider(apiKey, resolvedModel);

    default:
      return new OpenAIProvider(apiKey, resolvedModel, resolvedEmbedding);
  }
}
