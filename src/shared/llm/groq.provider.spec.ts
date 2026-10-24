import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { ErrorCode } from '../common/errorCode';
import { GroqProvider } from './groq.provider';

jest.mock('groq-sdk', () => ({ __esModule: true, default: jest.fn() }));

const groqMock = Groq as unknown as jest.Mock;
const createMock = jest.fn<Promise<unknown>, [unknown]>();

const makeConfig = (values: Record<string, string>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('GroqProvider', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    groqMock.mockReset();
    createMock.mockReset();
    groqMock.mockImplementation(() => ({
      chat: { completions: { create: createMock } },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds the client with the API key, timeout and no SDK retries', () => {
    new GroqProvider(
      makeConfig({ GROQ_API_KEY: 'groq-key', LLM_TIMEOUT_MS: '7000' }),
    );

    expect(groqMock).toHaveBeenCalledWith({
      apiKey: 'groq-key',
      timeout: 7000,
      maxRetries: 0,
    });
  });

  it('sends text requests with system + user messages and maps text and usage', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'hello' } }],
      usage: { prompt_tokens: 4, completion_tokens: 6 },
    });
    const provider = new GroqProvider(makeConfig({ GROQ_API_KEY: 'k' }));

    const result = await provider.generateText({
      prompt: 'hi',
      systemPrompt: 'be brief',
      temperature: 0.2,
      maxOutputTokens: 100,
    });

    expect(createMock).toHaveBeenCalledWith({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
      ],
      temperature: 0.2,
      max_completion_tokens: 100,
    });
    expect(result._unsafeUnwrap()).toMatchObject({
      text: 'hello',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      usage: { inputTokens: 4, outputTokens: 6 },
    });
  });

  it('omits the system message when there is no system prompt', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: 'x' } }] });
    const provider = new GroqProvider(makeConfig({ GROQ_API_KEY: 'k' }));

    await provider.generateText({ prompt: 'hi' });

    const params = createMock.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    expect(params.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('uses GROQ_MODEL when set', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: 'x' } }] });
    const provider = new GroqProvider(
      makeConfig({ GROQ_API_KEY: 'k', GROQ_MODEL: 'groq-custom' }),
    );

    const result = await provider.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrap().model).toBe('groq-custom');
  });

  it('enables JSON mode and puts the schema in the system prompt', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: '{"a":1}' } }],
    });
    const provider = new GroqProvider(makeConfig({ GROQ_API_KEY: 'k' }));
    const schema = { type: 'object' };

    const result = await provider.generateJson<{ a: number }>({
      prompt: 'hi',
      systemPrompt: 'be brief',
      schema,
    });

    const params = createMock.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
      response_format: unknown;
    };
    expect(params.response_format).toEqual({ type: 'json_object' });
    expect(params.messages[0].role).toBe('system');
    expect(params.messages[0].content).toContain('be brief');
    expect(params.messages[0].content).toContain('JSON');
    expect(params.messages[0].content).toContain(JSON.stringify(schema));
    expect(result._unsafeUnwrap().data).toEqual({ a: 1 });
  });

  it('does not build a client or call the SDK without an API key', async () => {
    const provider = new GroqProvider(makeConfig({}));

    const result = await provider.generateText({ prompt: 'hi' });

    expect(groqMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.InternalServerError);
  });

  it('maps an SDK rate-limit error to TooManyRequests', async () => {
    createMock.mockRejectedValue({ status: 429 });
    const provider = new GroqProvider(makeConfig({ GROQ_API_KEY: 'k' }));

    const result = await provider.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.TooManyRequests);
  });
});
