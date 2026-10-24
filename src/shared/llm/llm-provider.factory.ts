import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FallbackLlmProvider } from './fallback-llm.provider';
import type { GeminiProvider } from './gemini.provider';
import type { GroqProvider } from './groq.provider';
import type { ILlmProvider } from './llm.provider';
import type { LlmProviderName } from './llm.types';

export function resolvePrimaryProviderName(
  raw: string | undefined,
  logger: Logger,
): LlmProviderName {
  const value = raw?.trim().toLowerCase();

  if (value === 'gemini' || value === 'groq') {
    return value;
  }

  if (value) {
    logger.warn(
      `Unknown LLM_PRIMARY_PROVIDER "${raw}"; falling back to "gemini"`,
    );
  }
  return 'gemini';
}

/** Builds the provider bound to the `ILlmProvider` DI token. */
export function createFallbackLlmProvider(
  config: ConfigService,
  gemini: GeminiProvider,
  groq: GroqProvider,
): ILlmProvider {
  const logger = new Logger('LlmModule');

  if (!config.get<string>('GEMINI_API_KEY')) {
    logger.warn('GEMINI_API_KEY is not set; Gemini calls will fail');
  }
  if (!config.get<string>('GROQ_API_KEY')) {
    logger.warn('GROQ_API_KEY is not set; Groq calls will fail');
  }

  const primaryName = resolvePrimaryProviderName(
    config.get<string>('LLM_PRIMARY_PROVIDER'),
    logger,
  );

  return primaryName === 'gemini'
    ? new FallbackLlmProvider(gemini, groq)
    : new FallbackLlmProvider(groq, gemini);
}
