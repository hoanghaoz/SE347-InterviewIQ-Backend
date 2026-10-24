import { Logger } from '@nestjs/common';
import { ErrorCode } from '../common/errorCode';
import { BaseLlmVendorProvider } from './base-llm-vendor.provider';
import { LLM_UNAVAILABLE_MESSAGE } from './llm-error.mapper';
import type {
  LlmProviderName,
  LlmRawCompletion,
  LlmTextRequest,
} from './llm.types';

class FakeVendorProvider extends BaseLlmVendorProvider {
  protected readonly providerName: LlmProviderName = 'gemini';
  protected readonly model = 'fake-model';
  protected readonly logger = new Logger('FakeVendorProvider');

  configured = true;
  readonly completeMock = jest.fn<
    Promise<LlmRawCompletion>,
    [LlmTextRequest, Record<string, unknown> | undefined]
  >();

  protected isConfigured(): boolean {
    return this.configured;
  }

  protected completeAsync(
    request: LlmTextRequest,
    jsonSchema?: Record<string, unknown>,
  ): Promise<LlmRawCompletion> {
    return this.completeMock(request, jsonSchema);
  }
}

const fence = '```';

describe('BaseLlmVendorProvider', () => {
  let provider: FakeVendorProvider;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    provider = new FakeVendorProvider();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateText', () => {
    it('returns the text with provider metadata', async () => {
      provider.completeMock.mockResolvedValue({
        text: 'hello',
        usage: { inputTokens: 3, outputTokens: 5 },
      });

      const result = await provider.generateText({ prompt: 'hi' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toMatchObject({
          text: 'hello',
          provider: 'gemini',
          model: 'fake-model',
          usage: { inputTokens: 3, outputTokens: 5 },
        });
        expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
      }
      expect(provider.completeMock).toHaveBeenCalledWith(
        { prompt: 'hi' },
        undefined,
      );
    });

    it('returns an error without calling the vendor when not configured', async () => {
      provider.configured = false;

      const result = await provider.generateText({ prompt: 'hi' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.InternalServerError);
      }
      expect(provider.completeMock).not.toHaveBeenCalled();
    });

    it('maps a 429 vendor error to TooManyRequests', async () => {
      provider.completeMock.mockRejectedValue({ status: 429 });

      const result = await provider.generateText({ prompt: 'hi' });

      expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.TooManyRequests);
    });

    it('maps a 400 vendor error to BadRequest', async () => {
      provider.completeMock.mockRejectedValue({ status: 400 });

      const result = await provider.generateText({ prompt: 'hi' });

      expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.BadRequest);
    });

    it('maps an error without a status (timeout/network) to a generic failure', async () => {
      provider.completeMock.mockRejectedValue(new Error('Request timed out.'));

      const result = await provider.generateText({ prompt: 'hi' });

      const error = result._unsafeUnwrapErr();
      expect(error.code).toBe(ErrorCode.InternalServerError);
      expect(error.message).toBe(LLM_UNAVAILABLE_MESSAGE);
    });

    it('treats an empty response as a provider failure', async () => {
      provider.completeMock.mockResolvedValue({ text: '   ' });

      const result = await provider.generateText({ prompt: 'hi' });

      expect(result._unsafeUnwrapErr().code).toBe(
        ErrorCode.InternalServerError,
      );
    });
  });

  describe('generateJson', () => {
    const schema = { type: 'object' };

    it('parses the JSON and passes the schema to the vendor', async () => {
      provider.completeMock.mockResolvedValue({ text: '{"a":1}' });

      const result = await provider.generateJson<{ a: number }>({
        prompt: 'hi',
        schema,
      });

      expect(result._unsafeUnwrap().data).toEqual({ a: 1 });
      expect(provider.completeMock).toHaveBeenCalledWith(
        { prompt: 'hi' },
        schema,
      );
    });

    it('parses JSON wrapped in a markdown code fence', async () => {
      provider.completeMock.mockResolvedValue({
        text: `${fence}json\n{"a":1}\n${fence}`,
      });

      const result = await provider.generateJson({ prompt: 'hi', schema });

      expect(result._unsafeUnwrap().data).toEqual({ a: 1 });
    });

    it('retries once when the first output is not valid JSON', async () => {
      provider.completeMock
        .mockResolvedValueOnce({ text: 'not json' })
        .mockResolvedValueOnce({ text: '{"a":2}' });

      const result = await provider.generateJson({ prompt: 'hi', schema });

      expect(result._unsafeUnwrap().data).toEqual({ a: 2 });
      expect(provider.completeMock).toHaveBeenCalledTimes(2);
    });

    it('returns an error after two invalid outputs', async () => {
      provider.completeMock.mockResolvedValue({ text: 'still not json' });

      const result = await provider.generateJson({ prompt: 'hi', schema });

      expect(result._unsafeUnwrapErr().code).toBe(
        ErrorCode.InternalServerError,
      );
      expect(provider.completeMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry when the vendor call itself fails', async () => {
      provider.completeMock.mockRejectedValue({ status: 500 });

      const result = await provider.generateJson({ prompt: 'hi', schema });

      expect(result.isErr()).toBe(true);
      expect(provider.completeMock).toHaveBeenCalledTimes(1);
    });
  });
});
