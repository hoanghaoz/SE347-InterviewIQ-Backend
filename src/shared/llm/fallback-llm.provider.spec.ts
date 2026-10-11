import { Logger } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../common/errorCode';
import { FallbackLlmProvider } from './fallback-llm.provider';
import { LLM_UNAVAILABLE_MESSAGE } from './llm-error.mapper';
import type {
  LlmJsonResult,
  LlmProviderName,
  LlmTextResult,
} from './llm.types';

const makeFake = () => ({ generateText: jest.fn(), generateJson: jest.fn() });

const textResult = (provider: LlmProviderName): LlmTextResult => ({
  text: `from ${provider}`,
  provider,
  model: 'm',
  latencyMs: 1,
});

describe('FallbackLlmProvider', () => {
  const primary = makeFake();
  const secondary = makeFake();
  let fallback: FallbackLlmProvider;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    primary.generateText.mockReset();
    primary.generateJson.mockReset();
    secondary.generateText.mockReset();
    secondary.generateJson.mockReset();
    fallback = new FallbackLlmProvider(primary, secondary);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the primary result without touching the secondary', async () => {
    primary.generateText.mockResolvedValue(ok(textResult('gemini')));

    const result = await fallback.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrap().provider).toBe('gemini');
    expect(secondary.generateText).not.toHaveBeenCalled();
  });

  it.each([ErrorCode.InternalServerError, ErrorCode.TooManyRequests])(
    'falls back to the secondary when the primary fails with %s',
    async (code) => {
      primary.generateText.mockResolvedValue(err(new AppError(code, 'boom')));
      secondary.generateText.mockResolvedValue(ok(textResult('groq')));

      const result = await fallback.generateText({ prompt: 'hi' });

      expect(result._unsafeUnwrap().provider).toBe('groq');
      expect(secondary.generateText).toHaveBeenCalledWith({ prompt: 'hi' });
    },
  );

  it('does not fall back on BadRequest', async () => {
    const badRequest = new AppError(ErrorCode.BadRequest, 'bad');
    primary.generateText.mockResolvedValue(err(badRequest));

    const result = await fallback.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrapErr()).toBe(badRequest);
    expect(secondary.generateText).not.toHaveBeenCalled();
  });

  it('returns a generic error without leaking causes when both fail', async () => {
    primary.generateText.mockResolvedValue(
      err(new AppError(ErrorCode.InternalServerError, 'primary-secret')),
    );
    secondary.generateText.mockResolvedValue(
      err(new AppError(ErrorCode.TooManyRequests, 'secondary-secret')),
    );

    const result = await fallback.generateText({ prompt: 'hi' });

    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe(ErrorCode.InternalServerError);
    expect(error.message).toBe(LLM_UNAVAILABLE_MESSAGE);
    expect(error.message).not.toContain('secret');
  });

  it('falls back for generateJson as well', async () => {
    const jsonResult: LlmJsonResult<{ a: number }> = {
      data: { a: 1 },
      provider: 'groq',
      model: 'm',
      latencyMs: 1,
    };
    primary.generateJson.mockResolvedValue(
      err(new AppError(ErrorCode.InternalServerError, 'boom')),
    );
    secondary.generateJson.mockResolvedValue(ok(jsonResult));

    const result = await fallback.generateJson<{ a: number }>({
      prompt: 'hi',
      schema: { type: 'object' },
    });

    expect(result._unsafeUnwrap().data).toEqual({ a: 1 });
  });
});
