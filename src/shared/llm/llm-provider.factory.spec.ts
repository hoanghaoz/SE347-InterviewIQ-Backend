import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ok } from 'neverthrow';
import type { GeminiProvider } from './gemini.provider';
import type { GroqProvider } from './groq.provider';
import {
  createFallbackLlmProvider,
  resolvePrimaryProviderName,
} from './llm-provider.factory';
import type { LlmProviderName, LlmTextResult } from './llm.types';

const makeConfig = (values: Record<string, string>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const makeFake = (provider: LlmProviderName) => ({
  generateText: jest.fn().mockResolvedValue(
    ok({
      text: 'x',
      provider,
      model: 'm',
      latencyMs: 1,
    } satisfies LlmTextResult),
  ),
  generateJson: jest.fn(),
});

describe('resolvePrimaryProviderName', () => {
  let warn: jest.SpyInstance;
  const logger = new Logger('test');

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults to gemini without warning when unset', () => {
    expect(resolvePrimaryProviderName(undefined, logger)).toBe('gemini');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['gemini', 'gemini'],
    ['groq', 'groq'],
    [' GROQ ', 'groq'],
    ['Gemini', 'gemini'],
  ])('accepts "%s"', (raw, expected) => {
    expect(resolvePrimaryProviderName(raw, logger)).toBe(expected);
  });

  it('falls back to gemini and warns for an unknown value', () => {
    expect(resolvePrimaryProviderName('openai', logger)).toBe('gemini');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('openai'));
  });
});

describe('createFallbackLlmProvider', () => {
  const gemini = makeFake('gemini');
  const groq = makeFake('groq');
  const asProviders = () =>
    [
      gemini as unknown as GeminiProvider,
      groq as unknown as GroqProvider,
    ] as const;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    gemini.generateText.mockClear();
    groq.generateText.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses gemini first by default', async () => {
    const [g, q] = asProviders();
    const provider = createFallbackLlmProvider(
      makeConfig({ GEMINI_API_KEY: 'a', GROQ_API_KEY: 'b' }),
      g,
      q,
    );

    await provider.generateText({ prompt: 'hi' });

    expect(gemini.generateText).toHaveBeenCalledTimes(1);
    expect(groq.generateText).not.toHaveBeenCalled();
  });

  it('uses groq first when LLM_PRIMARY_PROVIDER=groq', async () => {
    const [g, q] = asProviders();
    const provider = createFallbackLlmProvider(
      makeConfig({
        LLM_PRIMARY_PROVIDER: 'groq',
        GEMINI_API_KEY: 'a',
        GROQ_API_KEY: 'b',
      }),
      g,
      q,
    );

    await provider.generateText({ prompt: 'hi' });

    expect(groq.generateText).toHaveBeenCalledTimes(1);
    expect(gemini.generateText).not.toHaveBeenCalled();
  });

  it('warns about each missing API key', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const [g, q] = asProviders();

    createFallbackLlmProvider(makeConfig({}), g, q);

    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.some((m) => m.includes('GEMINI_API_KEY'))).toBe(true);
    expect(messages.some((m) => m.includes('GROQ_API_KEY'))).toBe(true);
  });

  it('does not warn when both keys are set', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const [g, q] = asProviders();

    createFallbackLlmProvider(
      makeConfig({ GEMINI_API_KEY: 'a', GROQ_API_KEY: 'b' }),
      g,
      q,
    );

    expect(warn).not.toHaveBeenCalled();
  });
});
