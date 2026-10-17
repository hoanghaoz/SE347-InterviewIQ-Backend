import type { ConfigService } from '@nestjs/config';
import type { ILlmProvider } from './llm.provider';
import type { LlmProviderName } from './llm.types';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
export const DEFAULT_LLM_TIMEOUT_MS = 30_000;

/** DI token for the `{ gemini, groq }` lookup used by the playground. */
export const LLM_PROVIDER_LOOKUP = 'LLM_PROVIDER_LOOKUP';
export type LlmProviderLookup = Record<LlmProviderName, ILlmProvider>;

export function readLlmTimeoutMs(config: ConfigService): number {
  const parsed = Number(config.get<string>('LLM_TIMEOUT_MS'));
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_LLM_TIMEOUT_MS;
}
