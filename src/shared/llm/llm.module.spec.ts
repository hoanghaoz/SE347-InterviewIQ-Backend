import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { FallbackLlmProvider } from './fallback-llm.provider';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { LLM_PROVIDER_LOOKUP, type LlmProviderLookup } from './llm.constants';
import { LlmModule } from './llm.module';
import { ILlmProvider } from './llm.provider';

describe('LlmModule', () => {
  it('binds ILlmProvider to the fallback provider and exposes the lookup', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' })],
        }),
        LlmModule,
      ],
    }).compile();

    const provider = moduleRef.get(ILlmProvider);
    const lookup = moduleRef.get<LlmProviderLookup>(LLM_PROVIDER_LOOKUP);

    expect(provider).toBeInstanceOf(FallbackLlmProvider);
    expect(lookup.gemini).toBeInstanceOf(GeminiProvider);
    expect(lookup.groq).toBeInstanceOf(GroqProvider);
  });
});
