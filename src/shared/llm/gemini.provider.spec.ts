import { GoogleGenAI } from '@google/genai';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../common/errorCode';
import { GeminiProvider } from './gemini.provider';

jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));

const googleGenAiMock = GoogleGenAI as unknown as jest.Mock;
const generateContentMock = jest.fn<Promise<unknown>, [unknown]>();

const makeConfig = (values: Record<string, string>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('GeminiProvider', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    googleGenAiMock.mockReset();
    generateContentMock.mockReset();
    googleGenAiMock.mockImplementation(() => ({
      models: { generateContent: generateContentMock },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds the client with the API key and the configured timeout', () => {
    new GeminiProvider(
      makeConfig({ GEMINI_API_KEY: 'gem-key', LLM_TIMEOUT_MS: '5000' }),
    );

    expect(googleGenAiMock).toHaveBeenCalledWith({
      apiKey: 'gem-key',
      httpOptions: { timeout: 5000 },
    });
  });

  it('sends text requests with the default model and maps text and usage', async () => {
    generateContentMock.mockResolvedValue({
      text: 'hello',
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 6 },
    });
    const provider = new GeminiProvider(makeConfig({ GEMINI_API_KEY: 'k' }));

    const result = await provider.generateText({
      prompt: 'hi',
      systemPrompt: 'be brief',
      temperature: 0.2,
      maxOutputTokens: 100,
    });

    expect(generateContentMock).toHaveBeenCalledWith({
      model: 'gemini-3.8-flash',
      contents: 'hi',
      config: {
        systemInstruction: 'be brief',
        temperature: 0.2,
        maxOutputTokens: 100,
      },
    });
    expect(result._unsafeUnwrap()).toMatchObject({
      text: 'hello',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      usage: { inputTokens: 4, outputTokens: 6 },
    });
  });

  it('uses GEMINI_MODEL when set', async () => {
    generateContentMock.mockResolvedValue({ text: 'x' });
    const provider = new GeminiProvider(
      makeConfig({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-custom' }),
    );

    const result = await provider.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrap().model).toBe('gemini-custom');
  });

  it('requests JSON output with the schema in JSON mode', async () => {
    generateContentMock.mockResolvedValue({ text: '{"a":1}' });
    const provider = new GeminiProvider(makeConfig({ GEMINI_API_KEY: 'k' }));
    const schema = { type: 'object' };

    const result = await provider.generateJson<{ a: number }>({
      prompt: 'hi',
      schema,
    });

    const params = generateContentMock.mock.calls[0][0] as {
      config: { responseMimeType: string; responseJsonSchema: unknown };
    };
    expect(params.config.responseMimeType).toBe('application/json');
    expect(params.config.responseJsonSchema).toEqual(schema);
    expect(result._unsafeUnwrap().data).toEqual({ a: 1 });
  });

  it('does not build a client or call the SDK without an API key', async () => {
    const provider = new GeminiProvider(makeConfig({}));

    const result = await provider.generateText({ prompt: 'hi' });

    expect(googleGenAiMock).not.toHaveBeenCalled();
    expect(generateContentMock).not.toHaveBeenCalled();
    expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.InternalServerError);
  });

  it('maps an SDK rate-limit error to TooManyRequests', async () => {
    generateContentMock.mockRejectedValue({ status: 429 });
    const provider = new GeminiProvider(makeConfig({ GEMINI_API_KEY: 'k' }));

    const result = await provider.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.TooManyRequests);
  });
});
