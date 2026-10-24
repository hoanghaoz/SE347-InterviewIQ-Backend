import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { LLM_PROVIDER_LOOKUP, type LlmProviderLookup } from './llm.constants';
import { ILlmProvider } from './llm.provider';
import { createFallbackLlmProvider } from './llm-provider.factory';

@Module({
  providers: [
    GeminiProvider,
    GroqProvider,
    {
      provide: ILlmProvider,
      useFactory: createFallbackLlmProvider,
      inject: [ConfigService, GeminiProvider, GroqProvider],
    },
    {
      provide: LLM_PROVIDER_LOOKUP,
      useFactory: (
        gemini: GeminiProvider,
        groq: GroqProvider,
      ): LlmProviderLookup => ({ gemini, groq }),
      inject: [GeminiProvider, GroqProvider],
    },
  ],
  exports: [ILlmProvider, LLM_PROVIDER_LOOKUP],
})
export class LlmModule {}
